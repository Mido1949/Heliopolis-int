'use client';

import { useState, useEffect, useCallback } from 'react';
import { Upload, Button, Select, Input, Table, Tag, Modal, Image, Spin, message } from 'antd';
import { UploadOutlined, SearchOutlined, FileOutlined, FilePdfOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload';
import type { ClientFile } from '@/types/org';

const CATEGORIES = ['catalog','pricelist','brand','content','certificate','course','product','other'];

export default function FileManagerClient() {
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [uploadCategory, setUploadCategory] = useState('other');
  const [previewFile, setPreviewFile] = useState<ClientFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (categoryFilter) params.set('category', categoryFilter);
    if (search) params.set('search', search);
    const res = await fetch(`/api/files?${params}`);
    const data = await res.json();
    setFiles(data.files ?? []);
    setLoading(false);
  }, [categoryFilter, search]);

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
      message.success(`${file.name} uploaded successfully`);
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

  const columns = [
    {
      title: 'File',
      dataIndex: 'file_name',
      render: (name: string, record: ClientFile) => (
        <Button type="link" onClick={() => openPreview(record)}>
          {record.file_type === 'pdf' ? <FilePdfOutlined /> : <FileOutlined />} {name}
        </Button>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      render: (cat: string) => <Tag>{cat}</Tag>,
    },
    {
      title: 'Size',
      dataIndex: 'file_size',
      render: (size: number) => size ? `${(size / 1024).toFixed(1)} KB` : '-',
    },
    {
      title: 'Uploaded',
      dataIndex: 'created_at',
      render: (date: string) => new Date(date).toLocaleDateString('ar-EG'),
    },
    {
      title: 'AI Summary',
      dataIndex: 'ai_summary',
      render: (summary: string) => summary ? (
        <span className="text-xs text-gray-500 line-clamp-2">{summary}</span>
      ) : <span className="text-gray-300">Pending...</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">File Manager</h1>
        <div className="flex gap-2">
          <Select
            placeholder="Category for upload"
            value={uploadCategory}
            onChange={setUploadCategory}
            style={{ width: 160 }}
            options={CATEGORIES.map(c => ({ label: c, value: c }))}
          />
          <Upload
            beforeUpload={handleUpload}
            showUploadList={false}
            accept=".pdf,.jpg,.jpeg,.png,.mp4,.xlsx,.docx"
          >
            <Button icon={<UploadOutlined />} loading={uploading} type="primary">
              Upload File
            </Button>
          </Upload>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          prefix={<SearchOutlined />}
          placeholder="Search files..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 260 }}
          allowClear
        />
        <Select
          placeholder="Filter by category"
          value={categoryFilter}
          onChange={setCategoryFilter}
          allowClear
          style={{ width: 180 }}
          options={CATEGORIES.map(c => ({ label: c, value: c }))}
        />
      </div>

      <Table
        dataSource={files}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        open={!!previewFile}
        title={previewFile?.file_name}
        onCancel={() => { setPreviewFile(null); setPreviewUrl(null); }}
        footer={null}
        width={800}
      >
        {!previewUrl && <Spin />}
        {previewUrl && previewFile?.file_type === 'image' && (
          <Image src={previewUrl} alt={previewFile.file_name} style={{ width: '100%' }} />
        )}
        {previewUrl && previewFile?.file_type === 'pdf' && (
          <iframe src={previewUrl} style={{ width: '100%', height: 500 }} title="PDF Preview" />
        )}
        {previewFile?.ai_summary && (
          <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
            <strong>AI Summary:</strong> {previewFile.ai_summary}
          </div>
        )}
      </Modal>
    </div>
  );
}