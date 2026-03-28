import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { BOQItem, Lead } from "@/types";

const styles = StyleSheet.create({
  page: { padding: 30, fontFamily: "Helvetica", fontSize: 10, color: "#1a1a1a", backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: "#dc2626" },
  logoContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoBox: { width: 40, height: 40, backgroundColor: "#dc2626", borderRadius: 6, alignItems: "center", justifyContent: "center" },
  logoText: { fontSize: 12, fontWeight: "bold", color: "#fff" },
  companyInfo: { alignItems: "flex-end" },
  companyName: { fontSize: 14, fontWeight: "bold", color: "#dc2626" },
  companyNameAr: { fontSize: 10, color: "#666", marginTop: 2 },
  companyContact: { fontSize: 8, color: "#666", marginTop: 2, textAlign: "right" },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 20, color: "#1a1a1a", textAlign: "center" },
  infoRow: { flexDirection: "row", marginBottom: 15, gap: 20 },
  infoBox: { flex: 1, padding: 12, backgroundColor: "#f9fafb", borderRadius: 6, borderWidth: 1, borderColor: "#e5e7eb" },
  infoLabel: { fontSize: 8, color: "#6b7280", marginBottom: 4, textTransform: "uppercase" },
  infoValue: { fontSize: 12, fontWeight: "bold", color: "#1a1a1a" },
  infoValueSmall: { fontSize: 10, color: "#4b5563", marginTop: 2 },
  table: { width: "100%", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 4, overflow: "hidden", marginBottom: 20 },
  tableHeader: { flexDirection: "row", backgroundColor: "#dc2626", paddingVertical: 10, paddingHorizontal: 8 },
  tableHeaderText: { color: "#fff", fontWeight: "bold", fontSize: 9 },
  tableRow: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  tableRowAlt: { backgroundColor: "#f9fafb" },
  colNo: { width: 30 },
  colDesc: { width: 160 },
  colModel: { width: 70 },
  colQty: { width: 40, textAlign: "center" },
  colPrice: { width: 65, textAlign: "right" },
  colTotal: { width: 65, textAlign: "right" },
  totalsSection: { flexDirection: "row", justifyContent: "flex-end" },
  totalsBox: { width: 200, backgroundColor: "#f9fafb", borderRadius: 6, padding: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalLabel: { fontSize: 10, color: "#4b5563" },
  totalValue: { fontSize: 10, fontWeight: "bold" },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, marginTop: 4, borderTopWidth: 2, borderTopColor: "#dc2626" },
  grandTotalLabel: { fontSize: 14, fontWeight: "bold", color: "#dc2626" },
  grandTotalValue: { fontSize: 14, fontWeight: "bold", color: "#dc2626" },
  footer: { position: "absolute", bottom: 25, left: 30, right: 30, paddingTop: 15, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  footerText: { fontSize: 8, color: "#9ca3af", textAlign: "center" },
  footerTextAr: { fontSize: 8, color: "#9ca3af", textAlign: "center", marginTop: 2 },
  thankYou: { fontSize: 10, fontWeight: "bold", color: "#1a1a1a", textAlign: "center", marginBottom: 4 },
  thankYouAr: { fontSize: 10, color: "#666", textAlign: "center" },
  validText: { fontSize: 8, color: "#6b7280", textAlign: "center", marginTop: 8 },
});

interface BOQDocumentProps {
  items: BOQItem[];
  subtotal: number;
  discountPercent: number;
  vatAmount: number;
  grandTotal: number;
  grandTotalUSD?: number;
  dateCreated?: string;
  customer?: Lead & {
    customer_name?: string;
    customer_phone?: string;
    customer_address?: string;
  };
}

export function BOQDocument({ items, subtotal, discountPercent, vatAmount, grandTotal, grandTotalUSD, dateCreated, customer }: BOQDocumentProps) {
  const formatCurrency = (val: number) => new Intl.NumberFormat('en-EG', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
  const formatCurrencyUSD = (val?: number) => val !== undefined && val !== null ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val) : '';
  const formatDate = (dateStr?: string) => dateStr ? new Date(dateStr).toLocaleDateString('en-GB') : '';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header with Logo */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>GCHV</Text>
            </View>
            <View>
              <Text style={{ fontSize: 16, fontWeight: "bold", color: "#dc2626" }}>GCHV Egypt</Text>
              <Text style={{ fontSize: 8, color: "#666" }}>Premium HVAC Solutions</Text>
            </View>
          </View>
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>GCHV Egypt</Text>
            <Text style={styles.companyNameAr}>جي سي اتش في مصر</Text>
            <Text style={styles.companyContact}>📍 Cairo, Egypt</Text>
            <Text style={styles.companyContact}>📞 +20 100 123 4567</Text>
            <Text style={styles.companyContact}>✉️ contact@gchvegypt.com</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>Bill of Quantities / مقايسة أعمال</Text>

        {/* Client & Date Info */}
        <View style={styles.infoRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Client / العميل</Text>
            <Text style={styles.infoValue}>{customer?.name || customer?.customer_name || "N/A"}</Text>
            {(customer?.phone || customer?.customer_phone) && <Text style={styles.infoValueSmall}>{customer?.phone || customer?.customer_phone}</Text>}
            {(customer?.company || customer?.customer_address) && <Text style={styles.infoValueSmall}>{customer?.company || customer?.customer_address}</Text>}
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Date / التاريخ</Text>
            <Text style={styles.infoValue}>{dateCreated ? formatDate(dateCreated) : 'N/A'}</Text>
          </View>
        </View>

        {/* Products Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colNo]}>#</Text>
            <Text style={[styles.tableHeaderText, styles.colDesc]}>Description / الوصف</Text>
            <Text style={[styles.tableHeaderText, styles.colModel]}>Model</Text>
            <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderText, styles.colPrice]}>Unit Price</Text>
            <Text style={[styles.tableHeaderText, styles.colTotal]}>Total</Text>
          </View>
          
          {/* Table Rows */}
          {items && items.length > 0 ? items.map((item, index) => (
            <View key={index} style={index % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow}>
              <Text style={styles.colNo}>{index + 1}</Text>
              <View style={styles.colDesc}>
                <Text style={{ fontWeight: "bold", fontSize: 9 }}>{(item.product?.name) || item.model || 'Product'}</Text>
                {item.product?.sku && <Text style={{ fontSize: 7, color: "#6b7280" }}>SKU: {item.product.sku}</Text>}
              </View>
              <Text style={styles.colModel}>{item.model || '-'}</Text>
              <Text style={styles.colQty}>{item.quantity || 0}</Text>
              <Text style={styles.colPrice}>{formatCurrency(item.unit_price || 0)}</Text>
              <Text style={styles.colTotal}>{formatCurrency(item.total || 0)}</Text>
            </View>
          )) : (
            <View style={styles.tableRow}>
              <Text style={{ textAlign: "center", padding: 20, color: "#999" }}>No items in this BOQ</Text>
            </View>
          )}
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal / الإجمالي</Text>
              <Text style={styles.totalValue}>{formatCurrency(subtotal)} EGP</Text>
            </View>
            {discountPercent > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Discount / الخصم ({discountPercent}%)</Text>
                <Text style={[styles.totalValue, { color: "#dc2626" }]}>-{formatCurrency(subtotal * (discountPercent/100))} EGP</Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>VAT 14% / ضريبة القيمة المضافة</Text>
              <Text style={styles.totalValue}>{formatCurrency(vatAmount)} EGP</Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Grand Total / الإجمالي العام</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(grandTotal)} EGP</Text>
            </View>
            {typeof grandTotalUSD === 'number' && (
              <View style={[styles.totalRow, { marginTop: 6 }]}>
                <Text style={[styles.grandTotalLabel, { fontSize: 12 }]}>Total / الإجمالي</Text>
                <Text style={[styles.grandTotalValue, { fontSize: 12 }]}>{formatCurrencyUSD(grandTotalUSD)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.thankYou}>Thank you for choosing GCHV Egypt</Text>
          <Text style={styles.thankYouAr}>شكراً لاختياركم جي سي اتش في مصر</Text>
          <Text style={styles.validText}>This quotation is valid for 15 days | عرض السعر ساري لمدة ١٥ يوم</Text>
        </View>
      </Page>
    </Document>
  );
}
