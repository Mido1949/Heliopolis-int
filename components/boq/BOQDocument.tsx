import React from "react";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { BOQItem, Lead } from "@/types";

Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxM.woff2', fontWeight: 'normal' },
    { src: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc9.woff2', fontWeight: 'bold' },
  ]
});

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#333" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 40 },
  logoBox: { width: 120 },
  companyDetails: { textAlign: "right", color: "#666" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20, color: "#111" },
  clientBox: { marginBottom: 30, padding: 15, backgroundColor: "#f8fafc", borderRadius: 4 },
  sectionTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 5, color: "#64748b", textTransform: "uppercase" },
  table: { display: "flex", flexDirection: "column", width: "100%", borderTop: 1, borderTopColor: "#e2e8f0" },
  tableRow: { flexDirection: "row", borderBottom: 1, borderBottomColor: "#e2e8f0", paddingVertical: 8 },
  tableHeader: { fontWeight: "bold", backgroundColor: "#f1f5f9", paddingVertical: 10 },
  col1: { width: "40%", paddingLeft: 8 },
  col2: { width: "20%", textAlign: "right" },
  col3: { width: "15%", textAlign: "center" },
  col4: { width: "25%", textAlign: "right", paddingRight: 8 },
  totalBox: { marginTop: 20, alignSelf: "flex-end", width: "40%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  totalVal: { fontWeight: "bold" },
  grandTotal: { fontSize: 14, color: "#000", fontWeight: "bold" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center", color: "#94a3b8" }
});

interface BOQDocumentProps {
  items: BOQItem[];
  subtotal: number;
  discountPercent: number;
  vatAmount: number;
  grandTotal: number;
  grandTotalUSD?: number;
  dateCreated?: string;
  customer?: Lead;
}

export function BOQDocument({ items, subtotal, discountPercent, vatAmount, grandTotal, grandTotalUSD, dateCreated, customer }: BOQDocumentProps) {
  const formatCurrency = (val: number) => `${new Intl.NumberFormat('en-EG').format(val)} EGP`;
  const formatCurrencyUSD = (val?: number) =>
    val !== undefined && val !== null
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)
      : '';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Logo placeholder top-left */}
        <View style={{ marginBottom: 8 }}>
          <View style={{ width: 60, height: 30, borderWidth: 1, borderColor: '#3b82f6', borderRadius: 2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 8, color: '#64748b' }}>Logo</Text>
          </View>
        </View>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Text style={{ fontSize: 22, fontWeight: "bold", color: "#0284c7" }}>GCHV Egypt</Text>
            <Text style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>Premium HVAC Solutions (HVAC)</Text>
          </View>
          <View style={styles.companyDetails}>
            <Text>جي سي اتش في مصر (GCHV Egypt)</Text>
            <Text>123 Business District, Cairo</Text>
            <Text>contact@gchvegypt.com</Text>
            <Text>+20 100 123 4567</Text>
          </View>
        </View>

        <View style={{ marginBottom: 20 }}>
          <Text style={styles.title}>Bill of Quantities / مقايسة أعمال</Text>
        </View>

        {/* Client Details */}
        <View style={styles.clientBox}>
          <Text style={styles.sectionTitle}>Client Details / بيانات العميل</Text>
          {customer ? (
            <>
              <Text style={{ fontSize: 13, fontWeight: "bold", color: "#0f172a" }}>{customer.name}</Text>
              {customer.company && <Text style={{ marginTop: 4 }}>{customer.company}</Text>}
              {customer.phone && <Text style={{ marginTop: 2 }}>{customer.phone}</Text>}
            </>
          ) : (
            <Text>No Customer Specified / لم يتم تحديد عميل</Text>
          )}
          {dateCreated && (
            <Text style={{ fontSize: 9, color: '#64748b', marginTop: 6 }}>Date Created: {dateCreated}</Text>
          )}
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={styles.col1}>Description / الوصف</Text>
            <Text style={styles.col2}>Unit Price / السعر</Text>
            <Text style={styles.col3}>Qty / الكمية</Text>
            <Text style={styles.col4}>Total / الإجمالي</Text>
          </View>
          
          {items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <View style={styles.col1}>
                <Text style={{ fontWeight: "bold", color: "#1e293b" }}>{item.model}</Text>
                {item.product?.sku && <Text style={{ fontSize: 8, color: "#94a3b8", marginTop: 2 }}>SKU: {item.product.sku}</Text>}
              </View>
              <Text style={styles.col2}>{formatCurrency(item.unit_price)}</Text>
              <Text style={styles.col3}>{item.quantity}</Text>
              <Text style={styles.col4}>{formatCurrency(item.total)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalBox}>
          <View style={styles.totalRow}>
            <Text>Subtotal / الإجمالي الفرعي</Text>
            <Text style={styles.totalVal}>{formatCurrency(subtotal)}</Text>
          </View>
          {discountPercent > 0 && (
            <View style={styles.totalRow}>
              <Text>Discount ({discountPercent}%) / الخصم</Text>
              <Text style={[styles.totalVal, { color: "#e11d48" }]}>-{formatCurrency(subtotal * (discountPercent/100))}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text>VAT (14%) / ضريبة القيمة المضافة</Text>
            <Text style={styles.totalVal}>{formatCurrency(vatAmount)}</Text>
          </View>
          <View style={[styles.totalRow, { borderTop: 1, borderTopColor: "#94a3b8", marginTop: 6, paddingTop: 6 }]}> 
            <Text style={[styles.grandTotal, { color: "#0369a1" }]}>Grand Total / الإجمالي العام</Text>
            <Text style={[styles.grandTotal, { color: "#0369a1" }]}>{formatCurrency(grandTotal)}</Text>
          </View>
          {typeof grandTotalUSD === 'number' && (
            <View style={[styles.totalRow, { borderTop: 0, paddingTop: 6 }]}> 
              <Text style={[styles.grandTotal, { color: "#374151" }]}>Total (USD)</Text>
              <Text style={[styles.grandTotal, { color: "#0369a1" }]}>{formatCurrencyUSD(grandTotalUSD)}</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Thank you for choosing GCHV Egypt. شكراً لاختياركم جي سي اتش في مصر</Text>
          <Text style={{ marginTop: 4, fontSize: 8 }}>This quotation is valid for 15 days. عرض السعر ساري لمدة ١٥ يوم</Text>
        </View>
      </Page>
    </Document>
  );
}
