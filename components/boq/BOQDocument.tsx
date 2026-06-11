import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { BOQItem, Lead } from "@/types";

const NAVY = "#0D2137";
const RED = "#D72B2B";
const GREY = "#666666";
const LIGHT = "#F5F5F5";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1a1a1a",
    backgroundColor: "#fff",
  },
  brand: {
    flexDirection: "column",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  brandLogo: { fontSize: 28, fontWeight: "bold", color: NAVY, letterSpacing: 1 },
  brandSub: { fontSize: 12, fontWeight: "bold", color: RED, marginTop: 2 },
  rule: {
    borderBottomWidth: 1,
    borderBottomColor: "#999",
    marginVertical: 6,
  },
  offerTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: NAVY,
    textAlign: "center",
    marginTop: 4,
  },
  offerSub: {
    fontSize: 9,
    color: GREY,
    textAlign: "center",
    marginTop: 2,
  },
  metaRow: { flexDirection: "row", marginTop: 8, marginBottom: 4 },
  metaLeft: { flex: 1 },
  metaRight: { flex: 1, alignItems: "flex-end" },
  metaLabel: { fontSize: 8, color: GREY, textTransform: "uppercase" },
  metaValue: { fontSize: 10, color: "#1a1a1a", fontWeight: "bold" },
  supplierRow: {
    marginTop: 6,
    marginBottom: 4,
    fontSize: 9,
    color: "#1a1a1a",
  },
  supplierLabel: { fontWeight: "bold" },
  table: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#d4d4d4",
    marginTop: 4,
    marginBottom: 6,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: NAVY,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableHeaderText: { color: "#fff", fontWeight: "bold", fontSize: 8 },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tableRowAlt: { backgroundColor: LIGHT },
  sectionHeader: {
    flexDirection: "row",
    backgroundColor: "#e0e7ef",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  sectionHeaderText: {
    color: NAVY,
    fontWeight: "bold",
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  colType: { width: "16%", paddingRight: 4 },
  colCap: { width: "12%", textAlign: "center" },
  colQty: { width: "8%", textAlign: "center" },
  colModel: { width: "32%", paddingHorizontal: 4 },
  colPrice: { width: "16%", textAlign: "right" },
  colTotal: { width: "16%", textAlign: "right" },
  totals: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 6,
    marginBottom: 8,
  },
  totalsBox: { width: 260 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalLabel: { fontSize: 9, color: "#1a1a1a" },
  totalValue: { fontSize: 9, fontWeight: "bold" },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    marginTop: 3,
    borderTopWidth: 1,
    borderTopColor: "#999",
  },
  grandLabel: { fontSize: 11, fontWeight: "bold", color: NAVY },
  grandValue: { fontSize: 11, fontWeight: "bold", color: NAVY },
  discountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  finalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    marginTop: 3,
    backgroundColor: "#0D2137",
    paddingHorizontal: 6,
  },
  finalLabel: { fontSize: 11, fontWeight: "bold", color: "#fff" },
  finalValue: { fontSize: 12, fontWeight: "bold", color: "#fff" },
  section: { marginTop: 8 },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: NAVY,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  bullet: { fontSize: 8, color: "#1a1a1a", marginBottom: 2, lineHeight: 1.4 },
  twoCol: { flexDirection: "row", gap: 16 },
  twoColLeft: { flex: 1 },
  twoColRight: { flex: 1 },
  signaturesRow: {
    flexDirection: "row",
    marginTop: 18,
    gap: 12,
  },
  sigBox: {
    flex: 1,
    alignItems: "center",
  },
  sigLine: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    marginBottom: 4,
  },
  sigRole: { fontSize: 8, fontWeight: "bold", color: "#1a1a1a" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 30,
    right: 30,
    fontSize: 7,
    color: GREY,
    textAlign: "center",
  },
});

interface BOQDocumentProps {
  items: BOQItem[];
  subtotal: number;
  yBranchQty?: number;
  yBranchUnitPrice?: number;
  yBranchTotal?: number;
  grandTotal: number;
  discountPercent: number;
  discountAmount?: number;
  discountedTotal?: number;
  dateCreated?: string;
  boqNumber?: string;
  boqSerial?: number;
  createdBy?: string;
  customer?: Lead & {
    customer_name?: string;
    customer_phone?: string;
    customer_address?: string;
  };
}

type Group = 'indoor' | 'outdoor' | 'accessory';

function groupOfType(type: string): Group {
  if (type === 'Wall' || type === 'Cassette' || type === 'Ducted') return 'indoor';
  if (type === 'VRF Outdoor' || type === 'Mini VRF Outdoor') return 'outdoor';
  return 'accessory';
}

export function BOQDocument({
  items,
  subtotal,
  yBranchQty = 0,
  yBranchUnitPrice = 60,
  yBranchTotal = 0,
  grandTotal,
  discountPercent,
  discountAmount = 0,
  discountedTotal,
  dateCreated,
  boqNumber,
  boqSerial,
  createdBy,
  customer,
}: BOQDocumentProps) {
  const fmt = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(val);

  const today = new Date().toLocaleDateString('en-GB');
  const serialLabel = boqSerial ? `HLX-${boqSerial}` : (boqNumber || 'N/A');
  const finalTotal = discountedTotal ?? (grandTotal - discountAmount);

  const grouped: Record<Group, BOQItem[]> = { indoor: [], outdoor: [], accessory: [] };
  for (const item of items) {
    const t = item.unit_type || 'Unit';
    grouped[groupOfType(t)].push(item);
  }

  const order: Array<[Group, string]> = [
    ['indoor', 'Indoor Units'],
    ['outdoor', 'Outdoor Units'],
    ['accessory', 'Accessories / HRV'],
  ];

  const renderGroup = (g: Group, title: string) => {
    const list = grouped[g];
    if (list.length === 0) return null;
    return (
      <View key={g}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{title}</Text>
        </View>
        {list.map((item, idx) => {
          const cap = item.capacity_kw ?? 0;
          return (
            <View
              key={`${g}-${idx}`}
              style={idx % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow}
            >
              <Text style={[styles.colType, { fontSize: 8 }]}>
                {item.unit_type || 'Unit'}
              </Text>
              <Text style={[styles.colCap, { fontSize: 8 }]}>{cap > 0 ? String(cap) : '—'}</Text>
              <Text style={[styles.colQty, { fontSize: 8 }]}>{item.quantity || 0}</Text>
              <Text style={[styles.colModel, { fontSize: 8 }]}>{item.model || '-'}</Text>
              <Text style={[styles.colPrice, { fontSize: 8 }]}>{fmt(item.unit_price || 0)}</Text>
              <Text style={[styles.colTotal, { fontSize: 8, fontWeight: 'bold' }]}>
                {fmt(item.total || 0)}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Brand header */}
        <View style={styles.brand}>
          <Text style={styles.brandLogo}>HELIOMAX</Text>
          <Text style={styles.brandSub}>GCHV EGYPT</Text>
        </View>
        <View style={styles.rule} />

        {/* Offer title */}
        <Text style={styles.offerTitle}>Commercial Offer For VRF</Text>
        <Text style={styles.offerSub}>please find the financial offer</Text>
        <View style={styles.rule} />

        {/* Meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaLeft}>
            <Text style={styles.metaLabel}>From</Text>
            <Text style={styles.metaValue}>Heliopolis For Investment</Text>
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{dateCreated ? new Date(dateCreated).toLocaleDateString('en-GB') : today}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaLeft}>
            <Text style={styles.metaLabel}>To</Text>
            <Text style={styles.metaValue}>
              {customer?.name || customer?.customer_name || 'N/A'}
            </Text>
            {(customer?.phone || customer?.customer_phone) && (
              <Text style={{ fontSize: 8, color: '#1a1a1a' }}>
                {customer?.phone || customer?.customer_phone}
              </Text>
            )}
            {(customer?.company || customer?.customer_address) && (
              <Text style={{ fontSize: 8, color: '#1a1a1a' }}>
                {customer?.company || customer?.customer_address}
              </Text>
            )}
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.metaLabel}>PI No.</Text>
            <Text style={styles.metaValue}>{serialLabel}</Text>
          </View>
        </View>
        <View style={styles.rule} />

        {/* Supplier */}
        <View style={styles.supplierRow}>
          <Text style={styles.supplierLabel}>Supplier: </Text>
          <Text>GUANGDONG CARRIER HEATING, VENTILATION AND AIR CONDITIONING</Text>
        </View>
        <View style={styles.rule} />

        {/* Items table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colType]}>Type</Text>
            <Text style={[styles.tableHeaderText, styles.colCap]}>Capacity KW</Text>
            <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderText, styles.colModel]}>Model</Text>
            <Text style={[styles.tableHeaderText, styles.colPrice]}>Unit Price</Text>
            <Text style={[styles.tableHeaderText, styles.colTotal]}>Total Price $</Text>
          </View>

          {order.map(([g, title]) => renderGroup(g, title))}

          {/* Y-Branch row */}
          {yBranchQty > 0 && (
            <View style={styles.tableRow}>
              <Text style={[styles.colType, { fontSize: 8 }]}>Y-Branch</Text>
              <Text style={[styles.colCap, { fontSize: 8 }]}>—</Text>
              <Text style={[styles.colQty, { fontSize: 8 }]}>{yBranchQty}</Text>
              <Text style={[styles.colModel, { fontSize: 8 }]}>KHRP26A22C</Text>
              <Text style={[styles.colPrice, { fontSize: 8 }]}>{fmt(yBranchUnitPrice)}</Text>
              <Text style={[styles.colTotal, { fontSize: 8, fontWeight: 'bold' }]}>{fmt(yBranchTotal)}</Text>
            </View>
          )}

          {items.length === 0 && (
            <View style={styles.tableRow}>
              <Text style={{ textAlign: 'center', padding: 14, color: GREY, fontSize: 9 }}>
                No items in this BOQ
              </Text>
            </View>
          )}
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal (Items)</Text>
              <Text style={styles.totalValue}>{fmt(subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Y-Branch ({yBranchQty} × {fmt(yBranchUnitPrice)})</Text>
              <Text style={styles.totalValue}>{fmt(yBranchTotal)}</Text>
            </View>
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Total</Text>
              <Text style={styles.grandValue}>{fmt(grandTotal)}</Text>
            </View>
            {discountPercent > 0 && (
              <View style={styles.discountRow}>
                <Text style={styles.totalLabel}>Total after discount {discountPercent}%</Text>
                <Text style={[styles.totalValue, { color: RED }]}>−{fmt(discountAmount)}</Text>
              </View>
            )}
            <View style={styles.finalRow}>
              <Text style={styles.finalLabel}>Total After Discount</Text>
              <Text style={styles.finalValue}>{fmt(finalTotal)}</Text>
            </View>
          </View>
        </View>

        {/* Scope of supply */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scope of Supply includes:</Text>
          <Text style={styles.bullet}>• Supply and installation of a complete central VRF air-conditioning system</Text>
          <Text style={styles.bullet}>• Commissioning and startup of all equipment</Text>
          <Text style={styles.bullet}>• 3-year manufacturer warranty on compressor and main components</Text>
          <Text style={styles.bullet}>• Technical offer and design drawings included</Text>
        </View>

        {/* Exclusions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exclusions:</Text>
          <View style={styles.twoCol}>
            <View style={styles.twoColLeft}>
              <Text style={styles.bullet}>• Builder&apos;s work (walls, ceilings, false ceilings)</Text>
              <Text style={styles.bullet}>• Copper pipes, fittings, and insulation</Text>
              <Text style={styles.bullet}>• Power supply and water supply at site</Text>
              <Text style={styles.bullet}>• Electrical works and control panel</Text>
            </View>
            <View style={styles.twoColRight}>
              <Text style={styles.bullet}>• Drain piping, fittings, and cable tray</Text>
              <Text style={styles.bullet}>• Separate power supply with dedicated circuit breaker for each outdoor unit</Text>
              <Text style={styles.bullet}>• Maintenance contract and spare parts after warranty period</Text>
              <Text style={styles.bullet}>• Any items not listed in this offer</Text>
              <Text style={styles.bullet}>• Taxes and customs clearance (as per local regulations)</Text>
            </View>
          </View>
        </View>

        {/* Payment Terms */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Terms:</Text>
          <Text style={styles.bullet}>• 10% Down Payment upon contract signing</Text>
          <Text style={styles.bullet}>• 90% Upon Delivery of equipment</Text>
        </View>

        {/* Validity */}
        <View style={styles.section}>
          <Text style={styles.bullet}>
            <Text style={{ fontWeight: 'bold' }}>Validity: </Text>
            This offer is valid for 7 days from the date of issue.
          </Text>
        </View>

        {/* Signatures */}
        <View style={styles.signaturesRow}>
          <View style={styles.sigBox}>
            <View style={styles.sigLine} />
            <Text style={styles.sigRole}>Sales Engineer</Text>
          </View>
          <View style={styles.sigBox}>
            <View style={styles.sigLine} />
            <Text style={styles.sigRole}>Sales Manager</Text>
          </View>
          <View style={styles.sigBox}>
            <View style={styles.sigLine} />
            <Text style={styles.sigRole}>Financial Director</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          {createdBy ? `Prepared by: ${createdBy}  ·  ` : ''}Ref: {serialLabel}  ·  Heliomax · GCHV Egypt
        </Text>
      </Page>
    </Document>
  );
}
