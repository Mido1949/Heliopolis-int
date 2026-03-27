-- BOQ Tables and Persistence

-- 1. Create BOQs table
CREATE TABLE IF NOT EXISTS public.boqs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    customer_name TEXT, -- Fallback if no lead link
    customer_phone TEXT,
    customer_address TEXT,
    subtotal DECIMAL(12, 2) DEFAULT 0,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    vat_percent DECIMAL(5, 2) DEFAULT 14,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    vat_amount DECIMAL(12, 2) DEFAULT 0,
    grand_total DECIMAL(12, 2) DEFAULT 0,
    exchange_rate DECIMAL(10, 4) DEFAULT 50.5,
    status TEXT DEFAULT 'Draft', -- Draft, Sent, Expired, Accepted
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Create BOQ Items table
CREATE TABLE IF NOT EXISTS public.boq_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    boq_id UUID REFERENCES public.boqs(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    model TEXT, -- Snapshotted model name
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(12, 2) DEFAULT 0,
    total DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.boqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boq_items ENABLE ROW LEVEL SECURITY;

-- 4. Policies for BOQs
-- Admins can do everything
CREATE POLICY "Admins have full access to boqs" ON public.boqs
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- Sales Engineers can see/create their own or assigned leads' BOQs
CREATE POLICY "Users can manage their own BOQs" ON public.boqs
    FOR ALL TO authenticated
    USING (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.leads
            WHERE leads.id = boqs.lead_id AND (leads.assigned_to = auth.uid() OR leads.created_by = auth.uid())
        )
    )
    WITH CHECK (
        created_by = auth.uid()
    );

-- 5. Policies for BOQ Items (Linked to BOQ access)
CREATE POLICY "Access BOQ items if BOQ is accessible" ON public.boq_items
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.boqs
            WHERE boqs.id = boq_items.boq_id
        )
    );

-- 6. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_boq_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_boq_timestamp
    BEFORE UPDATE ON public.boqs
    FOR EACH ROW
    EXECUTE FUNCTION update_boq_timestamp();
