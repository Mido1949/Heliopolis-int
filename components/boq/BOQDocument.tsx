import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { BOQItem, Lead } from "@/types";

const BLUE  = "#0D52A8";
const LBLUE = "#1A6FD4";

const styles = StyleSheet.create({
  page: { padding: 30, fontFamily: "Helvetica", fontSize: 10, color: "#1a1a1a", backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: LBLUE },
  logoContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoBox: { width: 40, height: 40, backgroundColor: BLUE, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  logoText: { fontSize: 12, fontWeight: "bold", color: "#fff" },
  companyInfo: { alignItems: "flex-end" },
  companyName: { fontSize: 14, fontWeight: "bold", color: LBLUE },
  companyContact: { fontSize: 8, color: "#666", marginTop: 2, textAlign: "right" },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 20, color: "#1a1a1a", textAlign: "center" },
  infoRow: { flexDirection: "row", marginBottom: 15, gap: 12 },
  infoBox: { flex: 1, padding: 12, backgroundColor: "#f9fafb", borderRadius: 6, borderWidth: 1, borderColor: "#e5e7eb" },
  infoLabel: { fontSize: 8, color: "#6b7280", marginBottom: 4, textTransform: "uppercase" },
  infoValue: { fontSize: 12, fontWeight: "bold", color: "#1a1a1a" },
  infoValueSmall: { fontSize: 10, color: "#4b5563", marginTop: 2 },
  table: { width: "100%", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 4, overflow: "hidden", marginBottom: 20 },
  tableHeader: { flexDirection: "row", backgroundColor: BLUE, paddingVertical: 8, paddingHorizontal: 6 },
  tableHeaderText: { color: "#fff", fontWeight: "bold", fontSize: 8 },
  tableRow: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  tableRowAlt: { backgroundColor: "#f9fafb" },
  colZone:  { width: 75,  flexShrink: 0 },
  colFloor: { width: 44,  flexShrink: 0 },
  colArea:  { width: 34,  flexShrink: 0, textAlign: "center" },
  colType:  { width: 55,  flexShrink: 0 },
  colCap:   { width: 33,  flexShrink: 0, textAlign: "center" },
  colModel: { width: 90,  flexShrink: 0 },
  colQty:   { width: 30,  flexShrink: 0, textAlign: "center" },
  colPrice: { width: 74,  flexShrink: 0, textAlign: "right" },
  colTotal: { width: 74,  flexShrink: 0, textAlign: "right" },
  totalsSection: { flexDirection: "row", justifyContent: "flex-end" },
  totalsBox: { width: 200, backgroundColor: "#f9fafb", borderRadius: 6, padding: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalLabel: { fontSize: 10, color: "#4b5563" },
  totalValue: { fontSize: 10, fontWeight: "bold" },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, marginTop: 4, borderTopWidth: 2, borderTopColor: LBLUE },
  grandTotalLabel: { fontSize: 14, fontWeight: "bold", color: LBLUE },
  grandTotalValue: { fontSize: 14, fontWeight: "bold", color: LBLUE },
  footer: { position: "absolute", bottom: 25, left: 30, right: 30, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  footerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  footerText: { fontSize: 8, color: "#9ca3af", textAlign: "center" },
  thankYou: { fontSize: 10, fontWeight: "bold", color: "#1a1a1a", textAlign: "center", marginBottom: 4 },
  validText: { fontSize: 8, color: "#6b7280", textAlign: "center", marginTop: 4 },
  preparedBy: { fontSize: 8, color: "#4b5563" },
  boqRef: { fontSize: 8, color: "#4b5563" },
  conclusionSection: { marginTop: 14, marginBottom: 60 },
  sectionTitle: { fontSize: 8, fontWeight: "bold", color: BLUE, textTransform: "uppercase", marginBottom: 5, marginTop: 10, borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingBottom: 2 },
  bulletItem: { fontSize: 8, color: "#374151", marginBottom: 3, paddingLeft: 8 },
  sigRow: { flexDirection: "row", marginTop: 18, gap: 12 },
  sigBox: { flex: 1, borderTopWidth: 1, borderTopColor: "#374151", paddingTop: 6, alignItems: "center" },
  sigRole: { fontSize: 8, fontWeight: "bold", color: "#374151", marginBottom: 3 },
  sigName: { fontSize: 8, color: "#6b7280" },
});

interface BOQDocumentProps {
  items: BOQItem[];
  subtotal: number;
  discountPercent: number;
  vatAmount: number;
  grandTotal: number;
  grandTotalUSD?: number;
  dateCreated?: string;
  boqNumber?: string;
  boqSerial?: number;
  vatPercent?: number;
  createdBy?: string;
  customer?: Lead & {
    customer_name?: string;
    customer_phone?: string;
    customer_address?: string;
  };
}

export function BOQDocument({ items, subtotal, discountPercent, grandTotal, dateCreated, boqNumber, boqSerial, createdBy, customer }: BOQDocumentProps) {
  const fmt = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);

  const formatDate = (dateStr?: string) => dateStr ? new Date(dateStr).toLocaleDateString('en-GB') : '';

  const serialLabel = boqSerial ? `HLX-${boqSerial}` : (boqNumber || 'N/A');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>HM</Text>
            </View>
            <View>
              <Text style={{ fontSize: 16, fontWeight: "bold", color: LBLUE }}>Heliomax</Text>
              <Text style={{ fontSize: 8, color: "#666" }}>Premium HVAC Solutions</Text>
            </View>
          </View>
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>Heliomax</Text>
            <Text style={styles.companyContact}>Cairo, Egypt</Text>
            <Text style={styles.companyContact}>+201006600259</Text>
            <Text style={styles.companyContact}>contact@heliomax.com</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>Bill of Quantities</Text>

        {/* Client & Meta Info */}
        <View style={styles.infoRow}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Client</Text>
            <Text style={styles.infoValue}>{customer?.name || customer?.customer_name || "N/A"}</Text>
            {(customer?.phone || customer?.customer_phone) && <Text style={styles.infoValueSmall}>{customer?.phone || customer?.customer_phone}</Text>}
            {(customer?.company || customer?.customer_address) && <Text style={styles.infoValueSmall}>{customer?.company || customer?.customer_address}</Text>}
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>BOQ Number</Text>
            <Text style={styles.infoValue}>{serialLabel}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>{dateCreated ? formatDate(dateCreated) : 'N/A'}</Text>
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colZone]}>Zone / Room</Text>
            <Text style={[styles.tableHeaderText, styles.colFloor]}>Floor</Text>
            <Text style={[styles.tableHeaderText, styles.colArea]}>Area m²</Text>
            <Text style={[styles.tableHeaderText, styles.colType]}>Type</Text>
            <Text style={[styles.tableHeaderText, styles.colCap]}>kW</Text>
            <Text style={[styles.tableHeaderText, styles.colModel]}>Model</Text>
            <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderText, styles.colPrice]}>Unit Price</Text>
            <Text style={[styles.tableHeaderText, styles.colTotal]}>Total</Text>
          </View>

          {items && items.length > 0 ? items.map((item, index) => (
            <View key={index} style={index % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow}>
              <View style={styles.colZone}>
                <Text style={{ fontSize: 8, fontWeight: "bold" }}>{item.location || '-'}</Text>
                {item.product?.name && <Text style={{ fontSize: 7, color: "#6b7280", marginTop: 1 }}>{item.product.name}</Text>}
              </View>
              <Text style={[styles.colFloor, { fontSize: 8 }]}>{item.floor || '-'}</Text>
              <Text style={[styles.colArea,  { fontSize: 8 }]}>{item.area ? String(item.area) : '-'}</Text>
              <Text style={[styles.colType,  { fontSize: 8 }]}>{item.unit_type || '-'}</Text>
              <Text style={[styles.colCap,   { fontSize: 8 }]}>{item.capacity_kw ? String(item.capacity_kw) : '-'}</Text>
              <Text style={[styles.colModel, { fontSize: 8 }]}>{item.model || '-'}</Text>
              <Text style={[styles.colQty,   { fontSize: 8 }]}>{item.quantity || 0}</Text>
              <Text style={[styles.colPrice, { fontSize: 8 }]}>{fmt(item.unit_price || 0)}</Text>
              <Text style={[styles.colTotal, { fontSize: 8, fontWeight: "bold" }]}>{fmt(item.total || 0)}</Text>
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
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{fmt(subtotal)}</Text>
            </View>
            {discountPercent > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Discount ({discountPercent}%)</Text>
                <Text style={[styles.totalValue, { color: LBLUE }]}>-{fmt(subtotal * (discountPercent / 100))}</Text>
              </View>
            )}
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Grand Total</Text>
              <Text style={styles.grandTotalValue}>{fmt(grandTotal)}</Text>
            </View>
          </View>
        </View>

        {/* Conclusion */}
        <View style={styles.conclusionSection}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.bulletItem}>• Commissioning and startup of the equipment.</Text>
          <Text style={styles.bulletItem}>• Warranty for 3 years on the system.</Text>
          <Text style={styles.bulletItem}>• Prices are based on the technical offer according to the site plan. A slight adjustment on unit capacities may apply after inspection, at the same prices.</Text>

          <Text style={styles.sectionTitle}>This Offer Doesn't Include the Following</Text>
          <Text style={styles.bulletItem}>• Any builders' work (ceiling openings, sleeves, concrete base for equipment, painting, and any other civil works such as breaking / making walls, slabs, pipe or cable trenches).</Text>
          <Text style={styles.bulletItem}>• Supply and installation of copper pipes.</Text>
          <Text style={styles.bulletItem}>• Power and water at site.</Text>
          <Text style={styles.bulletItem}>• All electrical works such as main control panel, incoming cables to starters, power, and control cabling.</Text>
          <Text style={styles.bulletItem}>• Drain water piping, valves, fittings, cable trays, etc.</Text>
          <Text style={styles.bulletItem}>• A separate power supply with breaker for control circuit.</Text>
          <Text style={styles.bulletItem}>• Maintenance contract and spare parts.</Text>
          <Text style={styles.bulletItem}>• Any other items that are not explicitly mentioned in this offer.</Text>
          <Text style={styles.bulletItem}>• All prices are based on current taxes, customs, and tariffs in accordance with applicable governmental law and are subject to change per new announcements.</Text>

          <Text style={styles.sectionTitle}>Terms &amp; Conditions</Text>
          <Text style={styles.bulletItem}>• 10% Down Payment.</Text>
          <Text style={styles.bulletItem}>• 90% Upon Delivery.</Text>

          <Text style={styles.sectionTitle}>Validity</Text>
          <Text style={styles.bulletItem}>• This offer is valid for 15 days from the date of issue.</Text>

          <View style={styles.sigRow}>
            <View style={styles.sigBox}>
              <Text style={styles.sigRole}>Sales Engineer</Text>
              <Text style={styles.sigName}>Said Tarek</Text>
            </View>
            <View style={styles.sigBox}>
              <Text style={styles.sigRole}>Sales Manager</Text>
              <Text style={styles.sigName}>Ahmed Eid</Text>
            </View>
            <View style={styles.sigBox}>
              <Text style={styles.sigRole}>Financial Director</Text>
              <Text style={styles.sigName}>Ali Abo Elmkarem</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.thankYou}>Thank you for choosing Heliomax</Text>
          <View style={styles.footerRow}>
            <Text style={styles.preparedBy}>Prepared by: {createdBy || '—'}</Text>
            <Text style={styles.boqRef}>Ref: {serialLabel}</Text>
            <Text style={styles.footerText}>This quotation is valid for 15 days</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
