"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ProductCatalog } from "@/components/boq/ProductCatalog";
import { BOQEditor } from "@/components/boq/BOQEditor";
import { BOQSummary } from "@/components/boq/BOQSummary";
import { Product, BOQItem, Lead, BOQ } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { Download, Eye } from "lucide-react";
import dynamic from "next/dynamic";

const PDFDownloadButton = dynamic(() => import("@/components/boq/PDFDownloadButton"), {
  ssr: false,
  loading: () => <button disabled className="text-xs bg-gray-100 p-1.5 rounded opacity-50"><Download className="h-3 w-3" /></button>
});

import { useAuth } from "@/context/AuthContext";

export default function BOQPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const leadId = searchParams.get("leadId");
  const boqId = searchParams.get("id");
  const { user } = useAuth();

  // State
  const [activeTab, setActiveTab] = useState<"new" | "list">("new");
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Lead[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [activeItems, setActiveItems] = useState<BOQItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [customerInfo, setCustomerInfo] = useState({ name: "", phone: "", address: "" });
  const [discountPercent, setDiscountPercent] = useState(0);
  const [vatPercent, setVatPercent] = useState(14); // 14% VAT default in Egypt
  const [exchangeRate, setExchangeRate] = useState(50); // EGP/USD

  // State for all BOQs
  const [allBOQs, setAllBOQs] = useState<BOQ[]>([]);
  const [loadingBOQs, setLoadingBOQs] = useState(false);

  // Calculations
  const subtotal = activeItems.reduce((acc, item) => acc + item.total, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const taxableAmount = subtotal - discountAmount;
  const vatAmount = taxableAmount * (vatPercent / 100);
  const grandTotal = taxableAmount + vatAmount;

  const [isSaving, setIsSaving] = useState(false);

  // Memoized actions
  const fetchAllBOQs = useCallback(async () => {
    setLoadingBOQs(true);
    const { data } = await supabase
      .from("boqs")
      .select("*, lead:leads(name), boq_items(*, product(*))")
      .order("created_at", { ascending: false });
    
    if (data) setAllBOQs(data);
    setLoadingBOQs(false);
  }, [supabase]);

  const handleOpenBOQ = useCallback(async (boq: BOQ) => {
    // Set customer
    setSelectedCustomer(boq.lead_id || "");
    setCustomerInfo({
      name: boq.customer_name || "",
      phone: boq.customer_phone || "",
      address: boq.customer_address || ""
    });
    setDiscountPercent(boq.discount_percent || 0);
    setVatPercent(boq.vat_percent || 14);
    setExchangeRate(boq.exchange_rate || 50.5);

    // Fetch items
    const { data: itemsData } = await supabase
      .from("boq_items")
      .select("*, product(*)")
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
        product: item.product
      })));
    }
    setActiveTab("new");
  }, [supabase]);

  useEffect(() => {
    if (activeTab === "list") {
      fetchAllBOQs();
    }
  }, [activeTab, fetchAllBOQs]);

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      setLoadingProducts(true);
      // Fetch products
      const { data: pData } = await supabase.from("products").select("*").order("category");
      if (pData && pData.length > 0) {
        setProducts(pData);
      }

      // Fetch customers/leads
      const { data: cData } = await supabase.from("leads").select("*").order("name");
      if (cData && cData.length > 0) {
        setCustomers(cData);
      }
      setLoadingProducts(false);
    }
    fetchData();
  }, [supabase]);

  // Handle leadId from query param
  useEffect(() => {
    if (leadId && customers.length > 0) {
      const c = customers.find(x => x.id === leadId);
      if (c) {
        setSelectedCustomer(leadId);
        setCustomerInfo({ 
          name: c.name, 
          phone: c.phone || "", 
          address: c.company || c.region || "" 
        });
        setActiveTab("new");
      }
    }
  }, [leadId, customers]);

  // Handle boqId from query param
  useEffect(() => {
    async function fetchSpecificBOQ() {
      if (!boqId) return;

      const { data: boq } = await supabase
        .from("boqs")
        .select("*")
        .eq("id", boqId)
        .single();
      
      if (boq) {
        handleOpenBOQ(boq);
      }
    }
    fetchSpecificBOQ();
  }, [boqId, supabase, handleOpenBOQ]);

  const handleAddItem = (product: Product) => {
    // Check if item already exists
    const existing = activeItems.find(item => item.product_id === product.id);
    if (existing) {
      setActiveItems(activeItems.map(item => 
        item.product_id === product.id 
          ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unit_price }
          : item
      ));
    } else {
      const newItem: BOQItem = {
        id: Math.random().toString(36).substring(7),
        boq_id: "draft",
        product_id: product.id,
        model: product.model,
        quantity: 1,
        unit_price: product.price || 0,
        total: product.price || 0,
        product: product
      };
      setActiveItems([...activeItems, newItem]);
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

  const handleSave = async (customerName: string, customerPhone: string, customerAddress: string) => {
    if (activeItems.length === 0) {
      alert("No items in BOQ");
      return;
    }

    setIsSaving(true);
    try {
      const profileId = user?.id;
      let currentLeadId = selectedCustomer;

      // Auto-create lead if phone is provided and doesn't exist
      if (!currentLeadId && customerPhone) {
        const { data: existingLead } = await supabase
          .from("leads")
          .select("id")
          .eq("phone", customerPhone)
          .maybeSingle();

        if (existingLead) {
          currentLeadId = existingLead.id;
        } else {
          const { data: newLead, error: leadError } = await supabase
            .from("leads")
            .insert({
              name: customerName,
              phone: customerPhone,
              status: "Quote Sent",
              source: "Direct",
              assigned_to: profileId,
              notes: `Auto-created from BOQ Builder. Address: ${customerAddress}`
            })
            .select()
            .single();

          if (leadError) throw leadError;
          currentLeadId = newLead.id;
        }
      }

      const boqNumber = `BOQ-${new Date().getFullYear()}${(new Date().getMonth()+1).toString().padStart(2, '0')}${new Date().getDate().toString().padStart(2, '0')}-${Math.floor(Math.random() * 9000) + 1000}`;
      
      const { data: boqData, error: boqError } = await supabase
        .from("boqs")
        .insert({
          boq_number: boqNumber,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_address: customerAddress,
          lead_id: currentLeadId || null,
          subtotal,
          discount_percent: discountPercent,
          discount_amount: discountAmount,
          vat_percent: vatPercent,
          vat_amount: vatAmount,
          grand_total: grandTotal,
          exchange_rate: exchangeRate,
          created_by: profileId,
          status: "Draft"
        })
        .select()
        .single();

      if (boqError) throw boqError;

      const itemsToInsert = activeItems.map(item => ({
        boq_id: boqData.id,
        product_id: item.product_id,
        model: item.model,
        quantity: item.quantity,
        unit_price: item.unit_price
      }));

      const { error: itemsError } = await supabase
        .from("boq_items")
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      alert("BOQ Saved Successfully!");
      setActiveItems([]);
      setSelectedCustomer("");
      setCustomerInfo({ name: "", phone: "", address: "" });
      setActiveTab("list");
      fetchAllBOQs();
    } catch (err: unknown) {
      console.error("Save error:", err);
      const message = err instanceof Error ? err.message : String(err);
      alert("Error saving BOQ: " + message);
    } finally {
      setIsSaving(false);
    }
  };


  const handleRemoveItem = (itemId: string) => {
    setActiveItems(activeItems.filter(item => item.id !== itemId));
  };

  return (
    <div className="flex-1 overflow-x-hidden overflow-y-auto lg:overflow-hidden p-4 lg:p-6 flex flex-col min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] bg-gray-50/50">
      <div className="mb-6 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">BOQ Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build, track, and export quotes. عروض الأسعار
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
          {/* Left Panel: Catalog (3 cols) */}
          <div className="lg:col-span-3 h-[500px] lg:h-full lg:overflow-hidden">
            <ProductCatalog 
              products={products} 
              loading={loadingProducts} 
              onAddItem={handleAddItem} 
            />
          </div>

          {/* Center Panel: Editor (6 cols) */}
          <div className="lg:col-span-6 h-[500px] lg:h-full lg:overflow-hidden">
            <BOQEditor 
              items={activeItems}
              customers={customers}
              selectedCustomer={selectedCustomer}
              onSelectCustomer={(customerId) => {
                setSelectedCustomer(customerId);
                const c = customers.find(x => x.id === customerId);
                if (c) {
                  setCustomerInfo({ name: c.name, phone: c.phone || "", address: c.company || c.region || "" });
                }
              }}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
            />
          </div>

          {/* Right Panel: Summary (3 cols) */}
          <div className="lg:col-span-3 h-[500px] lg:h-full lg:overflow-hidden">
            <BOQSummary 
              items={activeItems}
              subtotal={subtotal}
              discountPercent={discountPercent}
              onUpdateDiscount={setDiscountPercent}
              vatPercent={vatPercent}
              onUpdateVat={setVatPercent}
              vatAmount={vatAmount}
              grandTotal={grandTotal}
              exchangeRate={exchangeRate}
              onUpdateExchangeRate={setExchangeRate}
              customerInfo={customerInfo}
              onUpdateCustomerInfo={setCustomerInfo}
              customer={{...customers[0], name: customerInfo.name, phone: customerInfo.phone, company: customerInfo.address, id: "manual"} as Lead}
              onSave={() => handleSave(customerInfo.name, customerInfo.phone, customerInfo.address)}
              isSaving={isSaving}
            />
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm flex-1 overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-gray-50/50 flex justify-between items-center">
            <h3 className="font-semibold">Recent BOQs | أحدث المقايسات</h3>
            <button 
              onClick={fetchAllBOQs}
              className="text-xs text-accent hover:underline flex items-center gap-1"
            >
              Refresh | تحديث
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-gray-50/50 sticky top-0 border-b">
                <tr>
                  <th className="p-4 font-medium text-muted-foreground whitespace-nowrap">BOQ Number</th>
                  <th className="p-4 font-medium text-muted-foreground">Customer</th>
                  <th className="p-4 font-medium text-muted-foreground">Total (EGP)</th>
                  <th className="p-4 font-medium text-muted-foreground">Total (USD)</th>
                  <th className="p-4 font-medium text-muted-foreground">Status</th>
                  <th className="p-4 font-medium text-muted-foreground">Date</th>
                  <th className="p-4 font-medium text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingBOQs ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground italic">Loading BOQs...</td>
                  </tr>
                ) : allBOQs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground italic">No BOQs found. Start building one!</td>
                  </tr>
                ) : (
                  allBOQs.map((boq) => (
                    <tr key={boq.id} className="hover:bg-gray-50/80 transition-colors group">
                      <td className="p-4 font-medium text-accent">{boq.boq_number}</td>
                      <td className="p-4">
                        <div className="font-medium">{boq.customer_name || boq.lead?.name || "N/A"}</div>
                        <div className="text-xs text-muted-foreground">{boq.customer_phone || "No phone"}</div>
                      </td>
                      <td className="p-4 font-medium">
                        {new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(boq.grand_total)}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        ${new Intl.NumberFormat('en-US').format(boq.grand_total / (boq.exchange_rate || 50))}
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
                            onClick={() => handleOpenBOQ(boq)}
                            className="text-xs bg-gray-100 hover:bg-gray-200 p-1.5 rounded transition-colors flex items-center gap-1"
                          >
                            <Eye className="h-3 w-3" /> Open
                          </button>
                          <PDFDownloadButton 
                            items={boq.boq_items || []}
                            subtotal={boq.subtotal}
                            discountPercent={boq.discount_percent}
                            vatAmount={boq.vat_amount}
                            grandTotal={boq.grand_total}
                            customer={{ name: boq.customer_name || boq.lead?.name || "Client" } as Lead}
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
