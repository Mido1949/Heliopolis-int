import React, { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import { BOQDocument } from "./BOQDocument";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { BOQItem, Lead } from "@/types";

interface PDFDownloadButtonProps {
  items: BOQItem[];
  subtotal: number;
  discountPercent: number;
  vatAmount: number;
  grandTotal: number;
  grandTotalUSD?: number;
  dateCreated?: string;
  boqNumber?: string;
  vatPercent?: number;
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
  label = "Export Pdf",
  grandTotalUSD,
  dateCreated,
  boqNumber,
  vatPercent,
  ...props 
}: PDFDownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (props.items.length === 0) return;
    
    setLoading(true);
    try {
      const fileName = `GCHV_BOQ_${props.customer?.name?.replace(/\s+/g, '_') || 'Draft'}.pdf`;
      const blob = await pdf(<BOQDocument {...props} grandTotalUSD={grandTotalUSD} dateCreated={dateCreated} boqNumber={boqNumber} vatPercent={vatPercent} />).toBlob();
      saveAs(blob, fileName);
    } catch (error) {
      console.error("PDF generation failed:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to generate PDF: ${errorMessage}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      variant={variant}
      size={size}
      className={className}
      disabled={loading || props.items.length === 0}
      onClick={handleDownload}
    >
      {loading ? (
        <Loader2 className={size === "icon" ? "h-4 w-4 animate-spin" : "mr-2 h-4 w-4 animate-spin"} />
      ) : (
        <Download className={size === "icon" ? "h-4 w-4" : "mr-2 h-4 w-4"} />
      )}
      {size !== "icon" && (loading ? "Generating..." : label)}
    </Button>
  );
}
