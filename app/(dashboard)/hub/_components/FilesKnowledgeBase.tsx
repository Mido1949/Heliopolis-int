'use client';

import { useState, useEffect, useCallback } from 'react';
import { Upload, Button, Select, Tag, Spin, message, Modal, Empty } from 'antd';
import {
  UploadOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload';
import type { ClientFile } from '@/types/org';

const CATEGORIES = ['catalog', 'pricelist', 'brand', 'content', 'certificate', 'course', 'product', 'other'];

const CATEGORY_COLORS: Record<string, string> = {
  catalog: 'blue',
  pricelist: 'green',
  brand: 'purple',
  content: 'orange',
  certificate: 'gold',
  course: 'cyan',
  product: 'geekblue',
  other: 'default',
};

function FileIcon({ fileType }: { fileType: string | null }) {
  if (fileType === 'pdf') return <FilePdfOutlined className="text-red-500 text-2xl" />;
  if (fileType === 'image') return <FileImageOutlined className="text-blue-500 text-2xl" />;
  return <FileOutlined className="text-slate-400 text-2xl" />;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesKnowledgeBase() {
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [uploadCategory, setUploadCategory] = useState('other');
  const [previewFile, setPreviewFile] = useState<ClientFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (categoryFilter) params.set('category', categoryFilter);
    const res = await fetch(`/api/files?${params}`);
    const data = await res.json();
    setFiles(data.files ?? []);
    setLoading(false);
  }, [categoryFilter]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleUpload = async (file: UploadFile) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file as unknown as Blob);
    formData.append('category', uploadCategory);
    const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) {
      message.error(`Upload failed: ${data.error}`);
    } else {
      message.success(`${file.name} uploaded`);
      fetchFiles();
    }
    setUploading(false);
    return false;
  };

  const openPreview = async (file: ClientFile) => {
    setPreviewFile(file);
    const res = await fetch(`/api/files/${file.id}/signed-url`);
    const data = await res.json();
    setPreviewUrl(data.url ?? null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Select
            placeholder="Filter by category"
            allowClear
            style={{ width: 180 }}
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={CATEGORIES.map(c => ({ label: c, value: c }))}
          />
          <span className="text-sm text-slate-400">{files.length} file{files.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={uploadCategory}
            onChange={setUploadCategory}
            style={{ width: 140 }}
            options={CATEGORIES.map(c => ({ label: c, value: c }))}
          />
          <Upload
            beforeUpload={handleUpload}
            showUploadList={false}
            accept="*/*"
          >
            <Button
              type="primary"
              icon={<UploadOutlined />}
              loading={uploading}
            >
              Upload File
            </Button>
          </Upload>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spin size="large" /></div>
      ) : files.length === 0 ? (
        <Empty description="No files yet. Upload your first file above." className="py-16" />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {files.map(file => (
            <div
              key={file.id}
              className="bg-white border border-slate-100 rounded-xl p-4 flex flex-col gap-2 hover:shadow-md transition-shadow cursor-pointer group"
              onClick={() => openPreview(file)}
            >
              <div className="flex items-center justify-between">
                <FileIcon fileType={file.file_type} />
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-[#0D2137]"
                  onClick={(e) => { e.stopPropagation(); openPreview(file); }}
                >
                  <EyeOutlined />
                </button>
              </div>
              <p className="text-xs font-semibold text-[#0D2137] truncate" title={file.file_name}>
                {file.file_name}
              </p>
              <div className="flex items-center justify-between">
                <Tag color={CATEGORY_COLORS[file.category ?? 'other'] ?? 'default'} className="text-[10px] m-0">
                  {file.category ?? 'other'}
                </Tag>
                <span className="text-[10px] text-slate-400">{formatBytes(file.file_size)}</span>
              </div>
              {file.ai_summary && (
                <p className="text-[10px] text-slate-500 line-clamp-2 border-t border-slate-50 pt-2">
                  {file.ai_summary}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!previewFile}
        title={previewFile?.file_name}
        footer={null}
        onCancel={() => { setPreviewFile(null); setPreviewUrl(null); }}
        width={800}
      >
        {previewFile && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
              <span><strong>Category:</strong> {previewFile.category ?? '—'}</span>
              <span><strong>Size:</strong> {formatBytes(previewFile.file_size)}</span>
              <span><strong>Type:</strong> {previewFile.file_type ?? '—'}</span>
            </div>

            {previewFile.ai_summary && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">AI Summary</p>
                <p className="text-sm text-slate-700">{previewFile.ai_summary}</p>
              </div>
            )}

            {previewUrl ? (
              previewFile.file_type === 'image' ? (
                <img src={previewUrl} alt={previewFile.file_name} className="w-full rounded-lg" />
              ) : previewFile.file_type === 'pdf' ? (
                <iframe src={previewUrl} className="w-full h-[500px] rounded-lg border" title={previewFile.file_name} />
              ) : (
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-sm">
                  Download / Open file
                </a>
              )
            ) : (
              <div className="flex justify-center py-8"><Spin /></div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}