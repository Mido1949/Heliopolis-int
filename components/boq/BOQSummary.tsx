"use client";

import React, { ComponentType } from "react";
import { BOQItem, Lead } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Save, Download, MessageCircle } from "lucide-react";
// We dynamically import the PDF component since @react-pdf/renderer relies on browser globals
import dynamic from "next/dynamic";

const PDFDownloadButton = dynamic(() => import("@/components/boq/PDFDownloadButton"), {
  ssr: false,
  loading: () => <Button disabled className="w-full h-10"><Download className="mr-2 h-4 w-4" /> Preparing PDF...</Button>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as ComponentType<any>;

interface BOQSummaryProps {
  items: BOQItem[];
  subtotal: number;
  discountPercent: number;
  onUpdateDiscount: (val: number) => void;
  vatPercent: number;
  onUpdateVat: (val: number) => void;
  vatAmount: number;
  grandTotal: number;
  exchangeRate: number;
  onUpdateExchangeRate: (val: number) => void;
  customerInfo: { name: string; phone: string; address: string };
  onUpdateCustomerInfo: (info: { name: string; phone: string; address: string }) => void;
  customer?: Lead;
  onSave?: () => void;
  isSaving?: boolean;
}

export function BOQSummary({
  items,
  subtotal,
  discountPercent,
  onUpdateDiscount,
  vatPercent,
  onUpdateVat,
  vatAmount,
  grandTotal,
  exchangeRate,
  onUpdateExchangeRate,
  customerInfo,
  onUpdateCustomerInfo,
  customer,
  onSave,
  isSaving = false
}: BOQSummaryProps) {
  
  const formatUSD = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const formatEGP = (val: number) => 
    new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(val);

  const grandTotalEGP = grandTotal * exchangeRate;

  const handleWhatsApp = () => {
    if (!customerInfo.phone) {
      alert("Please enter a phone number to send via WhatsApp.");
      return;
    }
    const text = `Hello ${customerInfo.name || 'valued customer'},\n\nHere is the summary of your quotation from GCHV Egypt:\n\n- Subtotal: ${formatUSD(subtotal)}\n- Discount: ${discountPercent}%\n- VAT: ${vatPercent}%\n\n*Grand Total: ${formatUSD(grandTotal)}*\n*Total in EGP: ${formatEGP(grandTotalEGP)}*\n(Rate: 1 USD = ${exchangeRate} EGP)\n\nPlease let us know if you have any questions.\n\nThank you!`;
    const url = `https://wa.me/${customerInfo.phone.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <Card className="h-full flex flex-col shadow-sm border-primary/20 bg-primary/5">
      <CardHeader className="py-4 border-b border-primary/10">
        <CardTitle className="text-lg">Summary</CardTitle>
      </CardHeader>
      
      <CardContent className="pt-6 flex-1 flex flex-col gap-6 overflow-auto">
        
        {/* Customer Details */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Client Details</h3>
          <div className="space-y-2">
            <Input 
              placeholder="Customer Name" 
              value={customerInfo.name} 
              onChange={e => onUpdateCustomerInfo({ ...customerInfo, name: e.target.value })} 
              className="text-sm h-9 bg-background" 
            />
            <Input 
              placeholder="Phone Number (e.g. +2010...)" 
              value={customerInfo.phone} 
              onChange={e => onUpdateCustomerInfo({ ...customerInfo, phone: e.target.value })} 
              className="text-sm h-9 bg-background" 
            />
            <Input 
              placeholder="Company / Address / Region" 
              value={customerInfo.address} 
              onChange={e => onUpdateCustomerInfo({ ...customerInfo, address: e.target.value })} 
              className="text-sm h-9 bg-background" 
            />
          </div>
        </div>

        {/* Calculation Details */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Calculations</h3>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Items ({items.reduce((s,i) => s + i.quantity, 0)})</span>
            <span className="font-medium">{formatUSD(subtotal)}</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-2">
              Discount
              <Input 
                type="number" 
                min="0" 
                max="100" 
                value={discountPercent} 
                onChange={(e) => onUpdateDiscount(parseFloat(e.target.value) || 0)}
                className="w-16 h-7 text-xs px-2 bg-background" 
              />
              %
            </span>
            <span className="font-medium text-destructive">
              -{formatUSD(subtotal * (discountPercent/100))}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-2">
              VAT
              <Input 
                type="number" 
                min="0" 
                max="100" 
                value={vatPercent} 
                onChange={(e) => onUpdateVat(parseFloat(e.target.value) || 0)}
                className="w-16 h-7 text-xs px-2 bg-background" 
              />
              %
            </span>
            <span className="font-medium">{formatUSD(vatAmount)}</span>
          </div>

          <Separator className="bg-primary/20" />

          {/* Exchange Rate Input */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              1 USD =
              <Input 
                type="number" 
                min="0" 
                step="0.1"
                value={exchangeRate} 
                onChange={(e) => onUpdateExchangeRate(parseFloat(e.target.value) || 0)}
                className="w-20 h-7 text-xs px-2 bg-background" 
              />
              EGP
            </span>
          </div>

          <Separator className="bg-primary/20" />

          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <div>
                <span className="text-base font-bold">Total (USD)</span>
                <p className="text-[10px] text-muted-foreground leading-none">incl. VAT</p>
              </div>
              <span className="text-2xl font-bold text-primary">
                {formatUSD(grandTotal)}
              </span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <span className="text-sm font-semibold text-muted-foreground">Total (EGP)</span>
              </div>
              <span className="text-lg font-bold text-muted-foreground">
                {formatEGP(grandTotalEGP)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex-col gap-3 pt-6 border-t border-primary/10 bg-background/50">
        <Button 
          className="w-full h-10" 
          variant="secondary" 
          disabled={items.length === 0 || isSaving}
          onClick={onSave}
        >
          <Save className="mr-2 h-4 w-4" /> 
          {isSaving ? "Saving..." : "Save Draft"}
        </Button>
        <div className="flex w-full gap-2">
          <div className="flex-1">
            {items.length === 0 ? (
              <Button disabled className="w-full h-10 px-2 justify-center">
                <Download className="mr-2 h-4 w-4 shrink-0" /> PDF
              </Button>
            ) : (
              <PDFDownloadButton 
                items={items}
                subtotal={subtotal}
                discountPercent={discountPercent}
                vatAmount={vatAmount}
                grandTotal={grandTotal}
                customer={customer}
              />
            )}
          </div>
          <Button 
            className="flex-1 h-10 px-2 justify-center bg-[#25D366] hover:bg-[#128C7E] text-white" 
            disabled={items.length === 0}
            onClick={handleWhatsApp}
          >
            <MessageCircle className="mr-2 h-4 w-4 shrink-0" /> WhatsApp
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
