"use client";

import React, { useState } from "react";
import { Product } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProductCatalogProps {
  products: Product[];
  loading: boolean;
  onAddItem: (product: Product) => void;
}

export function ProductCatalog({ products, loading, onAddItem }: ProductCatalogProps) {
  const [search, setSearch] = useState("");

  const safeProducts = products || [];
  const filteredProducts = safeProducts.filter(p => 
    (p.model ?? '').toLowerCase().includes(search.toLowerCase()) || 
    (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const grouped = filteredProducts.reduce((acc, product) => {
    if (!acc[product.category]) acc[product.category] = [];
    acc[product.category].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  const formatUSD = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <Card className="h-full flex flex-col shadow-sm border-muted">
      <CardHeader className="py-4 border-b shrink-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <span>Catalog</span>
          <Badge variant="secondary" className="ml-auto font-normal rounded-full">
            {safeProducts.length} Items
          </Badge>
        </CardTitle>
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            type="search" 
            placeholder="Search products, SKUs..." 
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />
            ))}
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  {category}
                </h3>
                <div className="space-y-2">
                  {items.map(product => (
                    <div 
                      key={product.id} 
                      className="group flex items-center justify-between p-3 rounded-lg border border-transparent hover:border-border hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1 mr-4">
                        <p className="text-sm font-medium truncate">{product.model}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{product.sku}</p>
                        <p className="text-xs font-semibold text-primary mt-1">
                          {formatUSD(product.price || 0)}
                        </p>
                      </div>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onAddItem(product)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {filteredProducts.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No products found.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
