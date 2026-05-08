export type Organization = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  logo_url: string | null;
  brand_colors: { primary: string; secondary: string } | null;
  settings: Record<string, unknown>;
  created_at: string;
};

export type Module = {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  icon: string | null;
  route: string;
  category: string | null;
  is_active: boolean;
};

export type OrgModule = {
  enabled: boolean;
  config: Record<string, unknown>;
  module: Module;
};

export type OrgMember = {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
};

export type ClientFile = {
  id: string;
  org_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  category: string | null;
  description: string | null;
  ai_summary: string | null;
  tags: string[] | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
};

export type ContentPost = {
  id: string;
  org_id: string;
  title: string;
  platform: string;
  status: string;
  scheduled_for: string;
  caption: string | null;
  image_url: string | null;
  hashtags: string[] | null;
  created_by: string;
  created_at: string;
};

export type Student = {
  id: string;
  org_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  grade: string | null;
  enrolled_courses: string[] | null;
  status: string;
  enrollment_date: string;
  notes: string | null;
  created_at: string;
};

export type Course = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  instructor: string | null;
  start_date: string | null;
  end_date: string | null;
  schedule: string | null;
  max_students: number | null;
  enrolled_count: number;
  status: string;
  price: number | null;
  created_at: string;
};