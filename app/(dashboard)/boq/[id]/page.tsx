"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProductCatalog } from "@/components/boq/ProductCatalog";
import { BOQEditor } from "@/components/boq/BOQEditor";
import { BOQSummary } from "@/components/boq/BOQSummary";
import { Product, BOQItem, Lead, BOQ } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { Download, Eye } from "lucide-react";
import { lazy } from "react";
import { useAuth } from "@/context/AuthContext";
import { useOrg } from "@/context/OrgContext";

const PDFDownloadButton = lazy(() => import("@/components/boq/PDFDownloadButton"));

export default function BOQPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadId = searchParams.get("leadId");
  const boqIdParam = params.id;
  const { user } = useAuth();
  const { currentOrgId } = useOrg();

  const [activeTab, setActiveTab] = useState<"new" | "list">("new");
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Lead[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [activeItems, setActiveItems] = useState<BOQItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [customerInfo, setCustomerInfo] = useState({ name: "", phone: "", address: "" });
  const [discountPercent, setDiscountPercent] = useState(0);
  const [profileName, setProfileName] = useState<string>("");
  const [currentBoqSerial, setCurrentBoqSerial] = useState<number | null>(null);
  const [currentBoqNumber, setCurrentBoqNumber] = useState<string | null>(null);

  const [allBOQs, setAllBOQs] = useState<BOQ[]>([]);
  const [loadingBOQs, setLoadingBOQs] = useState(false);
  const [currentBoqId, setCurrentBoqId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const subtotal = activeItems.reduce((acc, item) => acc + item.total, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const grandTotal = subtotal - discountAmount;

  // Fetch current user's profile name
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => { if (data?.name) setProfileName(data.name); });
  }, [user?.id, supabase]);

  const fetchAllBOQs = useCallback(async () => {
    if (!user?.id) return;
    setLoadingBOQs(true);
    try {
      const { data, error } = await supabase
        .from("boqs")
        .select("id, boq_number, boq_serial, customer_name, customer_phone, customer_address, grand_total, subtotal, discount_percent, status, created_at, created_by, lead:leads(name), boq_items(id, boq_id, model, quantity, unit_price, location, floor, area, unit_type, capacity_kw)")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        setFetchError(error.message);
      } else if (data) {
        setAllBOQs(data.map(boq => ({
          ...boq,
          boq_items: (boq.boq_items || []).map((item: BOQItem) => ({
            ...item,
            total: item.quantity * item.unit_price,
          })),
        })));
        setFetchError(null);
      }
    } catch (err) {
      console.error("Fetch Exception:", err);
    } finally {
      setLoadingBOQs(false);
    }
  }, [supabase, user?.id]);

  const handleOpenBOQ = useCallback(async (boq: BOQ) => {
    setCurrentBoqId(boq.id);
    setCurrentBoqSerial(boq.boq_serial || null);
    setCurrentBoqNumber(boq.boq_number || null);
    setSelectedCustomer(boq.lead_id || "");
    setCustomerInfo({
      name: boq.customer_name || "",
      phone: boq.customer_phone || "",
      address: boq.customer_address || ""
    });
    setDiscountPercent(boq.discount_percent || 0);

    const { data: itemsData } = await supabase
      .from("boq_items")
      .select("*, product:products(*)")
      .eq("boq_id", boq.id);

    if (itemsData) {
      setActiveItems(itemsData.map((item) => ({
        id: item.id,
        boq_id: item.boq_id,
        product_id: item.product_id,
        model: item.model,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.quantity * item.unit_price,
        location: item.location || undefined,
        floor: item.floor || undefined,
        area: item.area || undefined,
        unit_type: item.unit_type || undefined,
        capacity_kw: item.capacity_kw || undefined,
        product: item.product,
      })));
    }
    setActiveTab("new");
  }, [supabase]);

  useEffect(() => {
    if (activeTab === "list" && user?.id) fetchAllBOQs();
  }, [activeTab, user?.id, fetchAllBOQs]);

  // Keep a stable ref so the realtime callback always calls the latest fetchAllBOQs
  const fetchAllBOQsRef = useRef(fetchAllBOQs);
  useEffect(() => { fetchAllBOQsRef.current = fetchAllBOQs; }, [fetchAllBOQs]);

  // Realtime subscription — instantly reflects saves/updates for this user
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`boqs_${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "boqs",
        filter: `created_by=eq.${user.id}`,
      }, () => { fetchAllBOQsRef.current(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, user?.id]);

  useEffect(() => {
    async function fetchData() {
      const cached = localStorage.getItem("boq_products_cache");
      if (cached) {
        try {
          const { data, ts } = JSON.parse(cached);
          if (Date.now() - ts < 10 * 60 * 1000 && data.length > 0) {
            setProducts(data);
            setLoadingProducts(false);
          }
        } catch { /* ignore */ }
      }

      setLoadingProducts(true);
      const { data: pData } = await supabase.from("products").select("*").order("category");
      if (pData && pData.length > 0) {
        setProducts(pData);
        localStorage.setItem("boq_products_cache", JSON.stringify({ data: pData, ts: Date.now() }));
      }
      const { data: cData } = await supabase.from("leads").select("id, name, phone, company, region").order("name").limit(500);
      if (cData && cData.length > 0) setCustomers(cData);
      setLoadingProducts(false);
    }
    fetchData();
  }, [supabase]);

  useEffect(() => {
    if (leadId && customers.length > 0) {
      const c = customers.find(x => x.id === leadId);
      if (c) {
        setSelectedCustomer(leadId);
        setCustomerInfo({ name: c.name, phone: c.phone || "", address: c.company || c.region || "" });
        setActiveTab("new");
      }
    }
  }, [leadId, customers]);

  useEffect(() => {
    async function fetchSpecificBOQ() {
      if (!boqIdParam) return;
      const { data: boq } = await supabase.from("boqs").select("*").eq("id", boqIdParam).single();
      if (boq) handleOpenBOQ(boq);
    }
    fetchSpecificBOQ();
  }, [boqIdParam, supabase, handleOpenBOQ]);

  const handleAddItem = (product: Product) => {
    const existing = activeItems.find(item => item.product_id === product.id);
    if (existing) {
      setActiveItems(activeItems.map(item =>
        item.product_id === product.id
          ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unit_price }
          : item
      ));
    } else {
      setActiveItems([...activeItems, {
        id: Math.random().toString(36).substring(7),
        boq_id: "draft",
        product_id: product.id,
        model: product.model,
        quantity: 1,
        unit_price: product.price || 0,
        total: product.price || 0,
        product: product,
      }]);
    }
  };

  const handleUpdateQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      setActiveItems(activeItems.filter(item => item.id !== itemId));
      return;
    }
    setActiveItems(activeItems.map(item =>
      item.id === itemId
        ? { ...item, quantity: newQuantity, total: newQuantity * item.unit_price }
        : item
    ));
  };

  const handleUpdateDetails = (itemId: string, details: Partial<Pick<BOQItem, 'location' | 'floor' | 'area' | 'unit_type' | 'capacity_kw'>>) => {
    setActiveItems(activeItems.map(item =>
      item.id === itemId ? { ...item, ...details } : item
    ));
  };

  const handleRemoveItem = (itemId: string) => {
    setActiveItems(activeItems.filter(item => item.id !== itemId));
  };

  const handleSave = async (customerName: string, customerPhone: string, customerAddress: string) => {
    if (activeItems.length === 0) { alert("No items in BOQ"); return; }
    if (!user?.id) { alert("User not logged in."); return; }
    if (!customerName.trim()) { alert("Please enter customer name"); return; }

    setIsSaving(true);
    try {
      const profileId = user.id;
      let currentLeadId = selectedCustomer;

      if (!currentLeadId) {
        const { data: newLead, error: leadError } = await supabase
          .from("leads")
          .insert({ name: customerName, phone: customerPhone, company: customerAddress, source: "Direct", assigned_to: profileId, assigned_to_user: profileId, created_by: profileId, org_id: currentOrgId })
          .select("id").single();
        if (leadError) throw new Error(`Lead creation failed: ${leadError.message}`);
        if (!newLead?.id) throw new Error("No lead ID returned");
        currentLeadId = newLead.id;
      }

      let boqId = currentBoqId;
      let savedSerial = currentBoqSerial;
      const isNewBoq = !boqId;

      if (boqId) {
        const { error: boqError } = await supabase.from("boqs").update({
          lead_id: currentLeadId,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_address: customerAddress,
          subtotal,
          discount_percent: discountPercent,
          discount_amount: discountAmount,
          grand_total: grandTotal,
          updated_at: new Date().toISOString(),
        }).eq("id", boqId);
        if (boqError) throw new Error(`BOQ update failed: ${boqError.message}`);
        await supabase.from("boq_items").delete().eq("boq_id", boqId);
      } else {
        // Get next serial number from DB sequence
        const { data: serialData, error: serialError } = await supabase.rpc("get_next_boq_serial");
        if (serialError) console.warn("Serial RPC failed, falling back:", serialError.message);
        const nextSerial: number = serialData || (1001 + Math.floor(Math.random() * 9000));
        savedSerial = nextSerial;
        const boqNumber = `HLX-${nextSerial}`;

        const { data: boqData, error: boqError } = await supabase.from("boqs").insert({
          boq_number: boqNumber,
          boq_serial: nextSerial,
          lead_id: currentLeadId,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_address: customerAddress,
          created_by: profileId,
          org_id: currentOrgId,
          status: "Draft",
          subtotal,
          discount_percent: discountPercent,
          discount_amount: discountAmount,
          grand_total: grandTotal,
        }).select("id").single();

        if (boqError) throw new Error(`BOQ save failed: ${boqError.message}`);
        if (!boqData?.id) throw new Error("No BOQ ID returned");
        boqId = boqData.id;
        setCurrentBoqSerial(nextSerial);
        setCurrentBoqNumber(boqNumber);
      }

      const itemsToInsert = activeItems.map(item => ({
        boq_id: boqId,
        product_id: item.product_id || null,
        model: item.model,
        quantity: item.quantity,
        unit_price: item.unit_price,
        location: item.location || null,
        floor: item.floor || null,
        area: item.area || null,
        unit_type: item.unit_type || null,
        capacity_kw: item.capacity_kw || null,
        org_id: currentOrgId,
      }));

      const { error: itemsError } = await supabase.from("boq_items").insert(itemsToInsert);
      if (itemsError) throw new Error(`BOQ items save failed: ${itemsError.message}`);

      // Log BOQ creation as a CRM lead activity so it appears in the lead's Activity tab
      if (currentLeadId && isNewBoq) {
        await supabase.from("lead_activities").insert({
          lead_id: currentLeadId,
          user_id: profileId,
          type: "note",
          body: `📋 مقايسة جديدة: HLX-${savedSerial} — إجمالي: $${grandTotal.toFixed(0)}`,
        });
      }

      alert(`✅ BOQ Saved! Reference: HLX-${savedSerial}`);
      setActiveItems([]);
      setSelectedCustomer("");
      setCustomerInfo({ name: "", phone: "", address: "" });
      setCurrentBoqId(null);
      setCurrentBoqSerial(null);
      setCurrentBoqNumber(null);
      setActiveTab("list"); // triggers fetchAllBOQs via useEffect

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert("Error saving BOQ:\n" + message);
    } finally {
      setIsSaving(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const LoadingSpinner = () => (
    <button disabled className="text-xs bg-gray-100 p-1.5 rounded opacity-50">
      <Download className="h-3 w-3" />
    </button>
  );

  return (
    <div className="flex-1 overflow-x-hidden overflow-y-auto lg:overflow-hidden p-4 lg:p-6 flex flex-col min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] bg-gray-50/50">
      <div className="mb-6 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">BOQ Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build, track, and export quotes. v2.2 — Heliomax
            {profileName && <span className="ml-2 text-blue-600 font-medium">· {profileName}</span>}
          </p>
        </div>
        <div className="flex bg-white border rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setActiveTab("list")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === "list" ? "bg-accent text-white shadow-sm" : "text-muted-foreground hover:bg-gray-100"}`}
          >
            My BOQs | مقايساتي
          </button>
          <button
            onClick={() => setActiveTab("new")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === "new" ? "bg-accent text-white shadow-sm" : "text-muted-foreground hover:bg-gray-100"}`}
          >
            New BOQ | مقايسة جديدة
          </button>
        </div>
      </div>

      {activeTab === "new" ? (
        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 flex-1 lg:min-h-0 lg:overflow-hidden">
          <div className="lg:col-span-3 h-[500px] lg:h-full lg:overflow-hidden">
            <ProductCatalog products={products} loading={loadingProducts} onAddItem={handleAddItem} />
          </div>

          <div className="lg:col-span-6 h-[500px] lg:h-full lg:overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="text-sm font-semibold">
                BOQ Items
                {currentBoqSerial && <span className="ml-2 text-xs text-blue-600 font-normal">#{currentBoqSerial}</span>}
              </h2>
              <button
                onClick={() => {
                  const existing = activeItems.find(i => i.model === "Y-Branch");
                  if (existing) {
                    handleUpdateQuantity(existing.id, existing.quantity + 1);
                  } else {
                    setActiveItems(prev => [...prev, {
                      id: Math.random().toString(36).substring(7),
                      boq_id: "draft",
                      product_id: undefined,
                      model: "Y-Branch",
                      quantity: 1,
                      unit_price: 60,
                      total: 60,
                      product: undefined,
                    }]);
                  }
                }}
                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-md font-medium"
              >
                + Add Y-Branch ($60)
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <BOQEditor
                items={activeItems}
                customers={customers}
                selectedCustomer={selectedCustomer}
                onSelectCustomer={(customerId) => {
                  setSelectedCustomer(customerId);
                  const c = customers.find(x => x.id === customerId);
                  if (c) setCustomerInfo({ name: c.name, phone: c.phone || "", address: c.company || c.region || "" });
                }}
                onUpdateQuantity={handleUpdateQuantity}
                onUpdateDetails={handleUpdateDetails}
                onRemoveItem={handleRemoveItem}
              />
            </div>
          </div>

          <div className="lg:col-span-3 h-[500px] lg:h-full lg:overflow-hidden">
            <BOQSummary
              items={activeItems}
              subtotal={subtotal}
              discountPercent={discountPercent}
              onUpdateDiscount={setDiscountPercent}
              grandTotal={grandTotal}
              customerInfo={customerInfo}
              onUpdateCustomerInfo={setCustomerInfo}
              boqSerial={currentBoqSerial || undefined}
              boqNumber={currentBoqNumber || undefined}
              createdBy={profileName}
              dateCreated={new Date().toISOString()}
              customer={{ ...customers[0], name: customerInfo.name, phone: customerInfo.phone, company: customerInfo.address, id: "manual" } as Lead}
              onSave={() => handleSave(customerInfo.name, customerInfo.phone, customerInfo.address)}
              isSaving={isSaving}
            />
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm flex-1 overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-gray-50/50 flex justify-between items-center">
            <h3 className="font-semibold">Recent BOQs | أحدث المقايسات</h3>
            <button onClick={fetchAllBOQs} className="text-xs text-accent hover:underline flex items-center gap-1">
              Refresh | تحديث
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-gray-50/50 sticky top-0 border-b">
                <tr>
                  <th className="p-4 font-medium text-muted-foreground whitespace-nowrap">BOQ Ref</th>
                  <th className="p-4 font-medium text-muted-foreground">Customer</th>
                  <th className="p-4 font-medium text-muted-foreground">Total (USD)</th>
                  <th className="p-4 font-medium text-muted-foreground">Status</th>
                  <th className="p-4 font-medium text-muted-foreground">Date</th>
                  <th className="p-4 font-medium text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingBOQs ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground italic">Loading BOQs...</td></tr>
                ) : fetchError ? (
                  <tr><td colSpan={6} className="p-8 text-center text-red-500 font-bold bg-red-50">Error: {fetchError}</td></tr>
                ) : allBOQs.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground italic">No BOQs found. Start building one!</td></tr>
                ) : (
                  allBOQs.map((boq) => (
                    <tr key={boq.id} className="hover:bg-gray-50/80 transition-colors group">
                      <td className="p-4 font-medium text-blue-700">
                        {boq.boq_serial ? `HLX-${boq.boq_serial}` : boq.boq_number}
                      </td>
                      <td className="p-4">
                        <div className="font-medium">{boq.customer_name || boq.lead?.name || "N/A"}</div>
                        <div className="text-xs text-muted-foreground">{boq.customer_phone || "No phone"}</div>
                      </td>
                      <td className="p-4 font-medium">
                        ${new Intl.NumberFormat('en-US').format(boq.grand_total)}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          boq.status === 'Paid' ? 'bg-green-100 text-green-700' :
                          boq.status === 'Sent' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {boq.status}
                        </span>
                      </td>
                      <td className="p-4 text-muted-foreground whitespace-nowrap">
                        {new Date(boq.created_at).toLocaleDateString('en-GB')}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => router.push(`/boq?id=${boq.id}`)}
                            className="text-xs bg-gray-100 hover:bg-gray-200 p-1.5 rounded transition-colors flex items-center gap-1"
                          >
                            <Eye className="h-3 w-3" /> Open
                          </button>
                          <PDFDownloadButton
                            items={boq.boq_items || []}
                            subtotal={Number(boq.subtotal) || 0}
                            discountPercent={Number(boq.discount_percent) || 0}
                            grandTotal={Number(boq.grand_total) || 0}
                            dateCreated={boq.created_at || new Date().toISOString()}
                            boqNumber={boq.boq_number}
                            boqSerial={boq.boq_serial}
                            createdBy={boq.created_by_name || profileName}
                            customer={Object.assign({}, boq.lead, {
                              name: boq.customer_name || boq.lead?.name || "Client",
                              phone: boq.customer_phone || boq.lead?.phone || "",
                              company: boq.customer_address || boq.lead?.company || "",
                            })}
                            size="sm"
                            className="h-7 w-auto px-2"
                            label="PDF"
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
