"use client";

import React from "react";
import { BOQItem, Lead } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface BOQEditorProps {
  items: BOQItem[];
  customers: Lead[];
  selectedCustomer: string | null;
  onSelectCustomer: (customerId: string) => void;
  onUpdateQuantity: (itemId: string, qty: number) => void;
  onRemoveItem: (itemId: string) => void;
}

export function BOQEditor({ 
  items, 
  customers, 
  selectedCustomer, 
  onSelectCustomer, 
  onUpdateQuantity, 
  onRemoveItem 
}: BOQEditorProps) {

  return (
    <Card className="h-full flex flex-col shadow-sm border-muted">
      <CardHeader className="py-4 border-b shrink-0 flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Items List</CardTitle>
        <div className="w-[280px]">
          <Select 
            value={selectedCustomer || undefined} 
            onValueChange={(val) => onSelectCustomer(val as string)}
          >
            <SelectTrigger className="h-9">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Select Customer" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {customers.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} <span className="text-muted-foreground ml-1">({c.company || c.phone})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      
      <CardContent className="p-0 flex-1 min-h-0 relative">
        <ScrollArea className="h-full absolute inset-0">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-4">
              <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <Plus className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No items added</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Select products from the catalog on the left to start building your Bill of Quantities.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-[40%]">Product</TableHead>
                  <TableHead className="w-[15%] text-right">Price</TableHead>
                  <TableHead className="w-[20%] text-center">Qty</TableHead>
                  <TableHead className="w-[20%] text-right">Total</TableHead>
                  <TableHead className="w-[5%]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className="group">
                    <TableCell>
                      <p className="font-medium text-sm">{item.model}</p>
                      {item.product?.sku && (
                        <p className="text-xs text-muted-foreground">{item.product.sku}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {new Intl.NumberFormat('en-EG').format(item.unit_price)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => onUpdateQuantity(item.id, parseInt(e.target.value) || 1)}
                          className="w-16 h-8 text-center"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      {new Intl.NumberFormat('en-EG').format(item.total)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onRemoveItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Helper icon
function Plus(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
