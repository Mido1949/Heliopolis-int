'use client';

import { useState, useCallback } from 'react';
import {
  Modal, Button, Upload, Table, Typography, Alert, Progress, message,
} from 'antd';
import {
  DownloadOutlined, InboxOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import Papa from 'papaparse';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';

const { Title, Text } = Typography;
const { Dragger } = Upload;

interface ParsedRow {
  name: string;
  phone: string;
  company?: string;
  email?: string;
  status?: string;
  source?: string;
  region?: string;
  notes?: string;
  next_follow_up?: string;
  _isNew?: boolean;
  _rowIndex?: number;
}

const ALLOWED_STATUSES = ['New', 'Contacted', 'Interested', 'Proposal Sent', 'Won', 'Lost', 'On Hold'];
const ALLOWED_SOURCES = ['Direct', 'WhatsApp', 'Meta', 'Phone', 'Referral', 'Website'];

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export default function ImportModal({ open, onClose, onImportComplete }: ImportModalProps) {
  const { user } = useAuth();
  const { currentOrgId } = useOrg();
  const supabase = createClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [validRows, setValidRows] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState({ added: 0, updated: 0 });

  const downloadTemplate = useCallback(() => {
    const headers = ['name', 'phone', 'company', 'email', 'status', 'source', 'region', 'notes', 'next_follow_up'];
    const exampleRows = [
      ['أحمد محمد', '+201234567890', 'شركة التكييف المركزي', 'ahmed@example.com', 'New', 'WhatsApp', 'Cairo', 'عميل محتمل', '2026-05-01'],
      ['سارة علي', '+201234567891', 'مبنى الأهرام', 'sara@example.com', 'Interested', 'Direct', 'Alexandria', 'متابعة عرض سعر', '2026-05-05'],
    ];

    const csvContent = [headers.join(','), ...exampleRows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'heliomax-leads-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }, []);

const parseFile = useCallback(async (uploadedFile: File) => {
    setStep(2);

    const extension = uploadedFile.name.split('.').pop()?.toLowerCase();

    try {
      if (extension === 'csv') {
        const result = await new Promise<ParsedRow[]>((resolve, reject) => {
          Papa.parse(uploadedFile, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              const rows = results.data as Record<string, string>[];
              resolve(rows.map((r, idx) => ({
                ...r,
                _rowIndex: idx + 2,
                name: r.name || '',
                phone: r.phone || '',
                company: r.company,
                email: r.email,
                status: r.status,
                source: r.source,
                region: r.region,
                notes: r.notes,
                next_follow_up: r.next_follow_up,
              })));
            },
            error: (err) => reject(err),
          });
        });
        setParsedData(result);
        validateData(result);
      } else if (extension === 'xlsx' || extension === 'xls') {
        // Lazy-load xlsx only when an Excel file is actually imported — keeps it
        // out of the main CRM bundle.
        const XLSX = await import('xlsx');
        const buffer = await uploadedFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

        const parsed = rows.map((r, idx) => ({
          ...r,
          _rowIndex: idx + 2,
          name: r.name || '',
          phone: r.phone || '',
          company: r.company,
          email: r.email,
          status: r.status,
          source: r.source,
          region: r.region,
          notes: r.notes,
          next_follow_up: r.next_follow_up,
        })) as ParsedRow[];
        setParsedData(parsed);
        validateData(parsed);
      } else {
        message.error('يرجى رفع ملف CSV أو Excel');
        setStep(1);
      }
    } catch (err) {
      console.error('Parse error:', err);
      message.error('فشل قراءة الملف');
      setStep(1);
    }
  }, []);

  const validateData = (data: ParsedRow[]) => {
    const valid: ParsedRow[] = [];
    const errorMessages: string[] = [];

    data.forEach((row) => {
      if (!row.name?.trim()) {
        errorMessages.push(`صف رقم ${row._rowIndex}: اسم العميل مطلوب`);
        return;
      }
      if (!row.phone?.trim()) {
        errorMessages.push(`صف رقم ${row._rowIndex}: رقم الهاتف مطلوب`);
        return;
      }

      if (row.status && !ALLOWED_STATUSES.includes(row.status)) {
        errorMessages.push(`صف رقم ${row._rowIndex}: الحالة "${row.status}" غير صالحة. القيم المسموحة: ${ALLOWED_STATUSES.join(', ')}`);
        return;
      }
      if (row.source && !ALLOWED_SOURCES.includes(row.source)) {
        errorMessages.push(`صف رقم ${row._rowIndex}: المصدر "${row.source}" غير صالح. القيم المسموحة: ${ALLOWED_SOURCES.join(', ')}`);
        return;
      }

      valid.push({ ...row, _isNew: true });
    });

    setErrors(errorMessages);
    setValidRows(valid);
  };

  const doImport = useCallback(async () => {
    if (!user) return;
    setImporting(true);
    setProgress(0);

    let added = 0;
    let updated = 0;

    const phoneSet = new Set<string>();

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const phone = row.phone.trim();

      if (phoneSet.has(phone)) {
        continue;
      }
      phoneSet.add(phone);

      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', phone)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from('leads')
          .update({
            name: row.name,
            company: row.company || null,
            email: row.email || null,
            status: row.status || 'New',
            source: row.source || 'Direct',
            region: row.region || null,
            notes: row.notes || null,
            next_follow_up: row.next_follow_up || null,
          })
          .eq('id', existing[0].id);
        updated++;
      } else {
        await supabase.from('leads').insert({
          name: row.name,
          phone,
          company: row.company || null,
          email: row.email || null,
          status: row.status || 'New',
          source: row.source || 'Direct',
          region: row.region || null,
          notes: row.notes || null,
          next_follow_up: row.next_follow_up || null,
          assigned_to_user: user.id,
          created_by: user.id,
          org_id: currentOrgId,
        });
        added++;
      }

      setProgress(Math.round(((i + 1) / validRows.length) * 100));
    }

    setResult({ added, updated });
    setStep(3);
    setImporting(false);
    onImportComplete();
  }, [validRows, supabase, user, onImportComplete, currentOrgId]);

  const reset = () => {
    setStep(1);
    setParsedData([]);
    setValidRows([]);
    setErrors([]);
    setProgress(0);
    setResult({ added: 0, updated: 0 });
  };

  const previewColumns = [
    { title: 'الاسم', dataIndex: 'name', key: 'name' },
    { title: 'الهاتف', dataIndex: 'phone', key: 'phone' },
    { title: 'الشركة', dataIndex: 'company', key: 'company' },
    { title: 'الحالة', dataIndex: 'status', key: 'status' },
    { title: 'المصدر', dataIndex: 'source', key: 'source' },
  ];

  return (
    <Modal
      title="استيراد مجمع (Bulk Import)"
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
    >
      {step === 1 && (
        <div className="space-y-4">
          <Alert
            message="تنزيل نموذج الاستيراد"
            description={
              <Button type="link" icon={<DownloadOutlined />} onClick={downloadTemplate}>
                تحميل ملف النموذج (CSV)
              </Button>
            }
            type="info"
            showIcon
          />

          <Dragger
            accept=".csv,.xlsx,.xls"
            maxCount={1}
            beforeUpload={(file) => {
              parseFile(file);
              return false;
            }}
            showUploadList={false}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">اسحب الملف هنا أو انقر للاختيار</p>
            <p className="ant-upload-hint">支持 CSV 或 Excel 文件</p>
          </Dragger>

          <div className="text-sm text-gray-500">
            <Text strong>الأعمدة المطلوبة:</Text> name, phone
            <br />
            <Text strong>الأعمدة الاختيارية:</Text> company, email, status, source, region, notes, next_follow_up
            <br />
            <Text strong>الحالات المسموحة:</Text> {ALLOWED_STATUSES.join(', ')}
            <br />
            <Text strong>المصادر المسموحة:</Text> {ALLOWED_SOURCES.join(', ')}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Text>المجموع: {parsedData.length} صف | صالح: {validRows.length} صف</Text>
            <Button onClick={reset}>إلغاء</Button>
          </div>

          {errors.length > 0 && (
            <Alert
              type="warning"
              message={`${errors.length} أخطاء في البيانات`}
              description={
                <ul className="list-disc pl-4 mt-2 text-sm">
                  {errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                  {errors.length > 5 && <li>...و {errors.length - 5} أخطاء أخرى</li>}
                </ul>
              }
            />
          )}

          {validRows.length > 0 && (
            <>
              <Text>معاينة أول 10 صفوف:</Text>
              <Table
                columns={previewColumns}
                dataSource={validRows.slice(0, 10)}
                rowKey="_rowIndex"
                size="small"
                pagination={false}
                scroll={{ x: 400 }}
              />

              <div className="text-center">
                <Text strong>
                  سيتم إضافة {validRows.length} ليد جديد
                </Text>
              </div>

              <div className="flex justify-center gap-3">
                <Button onClick={reset}>إلغاء</Button>
                <Button
                  type="primary"
                  loading={importing}
                  onClick={doImport}
                  style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B' }}
                >
                  {importing ? `جاري الاستيراد... ${progress}%` : 'تأكيد الاستيراد'}
                </Button>
              </div>

              {importing && <Progress percent={progress} status="active" />}
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="text-center py-8">
          <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a' }} className="mb-4" />
          <Title level={4}>تم الاستيراد بنجاح</Title>
          <Text>
            ✓ تم إضافة {result.added} ليد جديد
            <br />
            ✓ تم تحديث {result.updated} ليد موجود
          </Text>
          <div className="mt-6">
            <Button type="primary" onClick={onClose}>
              إغلاق
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}