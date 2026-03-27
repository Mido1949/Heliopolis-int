"use client";

import React from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { BOQDocument } from "./BOQDocument";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { BOQItem, Lead } from "@/types";

interface PDFDownloadButtonProps {
  items: BOQItem[];
  subtotal: number;
  discountPercent: number;
  vatAmount: number;
  grandTotal: number;
  customer?: Lead;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
}

export default function PDFDownloadButton({ 
  variant = "default", 
  size = "default", 
  className = "w-full h-10", 
  label = "Export PDF",
  ...props 
}: PDFDownloadButtonProps) {
  // We use key based on customer and items length so it regenerates the blob when data changes
  const documentKey = `${props.customer?.id}-${props.items.length}-${props.grandTotal}`;

  return (
    <PDFDownloadLink
      key={documentKey}
      document={<BOQDocument {...props} />}
      fileName={`GCHV_BOQ_${props.customer?.name?.replace(/\s+/g, '_') || 'Draft'}.pdf`}
    >
      {({ loading }) => (
        <Button 
          variant={variant}
          size={size}
          className={className}
          disabled={loading || props.items.length === 0}
        >
          <Download className={size === "icon" ? "h-4 w-4" : "mr-2 h-4 w-4"} /> 
          {size !== "icon" && (loading ? "Generating..." : label)}
        </Button>
      )}
    </PDFDownloadLink>
  );
}
