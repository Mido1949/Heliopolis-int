"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ProductCatalog } from "@/components/boq/ProductCatalog";
import { BOQEditor } from "@/components/boq/BOQEditor";
import { BOQSummary } from "@/components/boq/BOQSummary";
import { Product, BOQItem, Lead } from "@/types";
import { createClient } from "@/lib/supabase/client";

export default function BOQPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const leadId = searchParams.get("leadId");
  
  // State for products
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // State for customers (leads)
  const [customers, setCustomers] = useState<Lead[]>([]);

  // State for the active BOQ Session
  const [activeItems, setActiveItems] = useState<BOQItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState({ name: "", phone: "", address: "" });
  const [discountPercent, setDiscountPercent] = useState(0);
  const [vatPercent, setVatPercent] = useState(14);
  const [exchangeRate, setExchangeRate] = useState(50.5);

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      setLoadingProducts(true);
      // Fetch products
      const { data: pData } = await supabase.from("products").select("*").order("category");
      if (pData && pData.length > 0) {
        setProducts(pData);
      } else {
        // Fallback mock data if DB empty
        setProducts([
          { id: "p1", sku: "GCHV-O-08-P", name: "CHV PRO Outdoor (8HP)", model: "CHV PRO Outdoor (8HP)", category: "Outdoor", price: 45000, stock_quantity: 10, stock: 10, min_stock: 2 },
          { id: "p2", sku: "GCHV-C-03-I", name: "4-Way Cassette (3HP)", model: "4-Way Cassette (3HP)", category: "Indoor", price: 12000, stock_quantity: 25, stock: 25, min_stock: 5 },
          { id: "p3", sku: "GCHV-D-05-H", name: "High Static Ducted (5HP)", model: "High Static Ducted (5HP)", category: "Indoor", price: 18500, stock_quantity: 15, stock: 15, min_stock: 3 },
          { id: "p4", sku: "ACC-CTRL-01", name: "Touch Controller (Smart)", model: "Touch Controller (Smart)", category: "Controller", price: 3500, stock_quantity: 50, stock: 50, min_stock: 10 },
        ]);
      }

      // Fetch customers/leads
      const { data: cData } = await supabase.from("leads").select("*").order("name");
      if (cData && cData.length > 0) {
        setCustomers(cData);
      } else {
        // Fallback mock
        setCustomers([
          { id: "c1", name: "Eng. Mahmoud Zaki", phone: "+201234567890", company: "Skyline Real Estate", status: "Interested", source: "Direct", assigned_to: "u1", created_at: "", updated_at: "" },
          { id: "c2", name: "Hassan Ali", phone: "+201000000000", company: "Al-Ahram Builders", status: "New", source: "WhatsApp", assigned_to: "u1", created_at: "", updated_at: "" }
        ]);
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
      }
    }
  }, [leadId, customers]);

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

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    try {
      setIsSaving(true);

      // 1. Get current user and verify profile
      const { data: { user } } = await supabase.auth.getUser();
      let profileId = null;
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();
        if (profile) profileId = profile.id;
      }

      // 1. Resolve Lead (Find or Create)
      let currentLeadId = selectedCustomer;

      if (!currentLeadId && customerInfo.phone) {
        // Check if lead with this phone already exists to avoid duplicates
        const { data: existingLead } = await supabase
          .from("leads")
          .select("id")
          .eq("phone", customerInfo.phone)
          .maybeSingle();

        if (existingLead) {
          currentLeadId = existingLead.id;
        } else {
          // Create new lead in CRM
          const { data: newLead, error: leadError } = await supabase
            .from("leads")
            .insert({
              name: customerInfo.name,
              phone: customerInfo.phone,
              status: "Quote Sent",
              source: "Direct",
              assigned_to: profileId,
              notes: `Auto-created from BOQ Builder. Address: ${customerInfo.address}`
            })
            .select()
            .single();

          if (leadError) throw leadError;
          currentLeadId = newLead.id;
        }
      }

      // 2. Insert BOQ
      const boqNumber = `BOQ-${new Date().getFullYear()}${(new Date().getMonth()+1).toString().padStart(2, '0')}${new Date().getDate().toString().padStart(2, '0')}-${Math.floor(Math.random() * 9000) + 1000}`;

      const { data: boqData, error: boqError } = await supabase
        .from("boqs")
        .insert({
          boq_number: boqNumber,
          lead_id: currentLeadId || null,
          customer_name: customerInfo.name,
          customer_phone: customerInfo.phone,
          customer_address: customerInfo.address,
          subtotal,
          discount_percent: discountPercent,
          discount_amount: subtotal * (discountPercent / 100),
          vat_percent: vatPercent,
          vat_amount: vatAmount,
          grand_total: grandTotal,
          exchange_rate: exchangeRate,
          status: "Draft",
          created_by: profileId
        })
        .select()
        .single();

      if (boqError) throw boqError;

      // 3. Insert BOQ Items
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
      // Optionally reset or navigate
    } catch (err: unknown) {
      console.error("Error saving BOQ:", err);
      const msg = err instanceof Error ? err.message : "Failed to save BOQ";
      alert("Error: " + msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setActiveItems(activeItems.filter(item => item.id !== itemId));
  };

  // Calculations
  const subtotal = activeItems.reduce((sum, item) => sum + item.total, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const subtotalAfterDiscount = subtotal - discountAmount;
  const vatAmount = subtotalAfterDiscount * (vatPercent / 100);
  const grandTotal = subtotalAfterDiscount + vatAmount;

  return (
    <div className="flex-1 overflow-x-hidden overflow-y-auto lg:overflow-hidden p-4 lg:p-6 flex flex-col min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)]">
      <div className="mb-6 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">BOQ Builder</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Build and export quotes. عروض الأسعار
          </p>
        </div>
      </div>

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

        {/* Right Panel: Summary & PDF Export (3 cols) */}
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
            onSave={handleSave}
            isSaving={isSaving}
          />
        </div>
      </div>
    </div>
  );
}
