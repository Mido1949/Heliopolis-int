import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(name: string): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

export function getDirection(lang: string): "rtl" | "ltr" {
  return lang === "ar" ? "rtl" : "ltr";
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatDate(dateString: string): string {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-EG", { day: "numeric", month: "short", year: "numeric" });
}

export function getWhatsAppUrl(phone: string, message?: string): string {
  if (!phone) return "#";
  const cleanPhone = phone.replace(/\D/g, "");
  return `https://wa.me/${cleanPhone}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

export function getStockStatus(stock: number, minStock: number): "in" | "low" | "out" {
  if (stock === 0) return "out";
  if (stock <= minStock) return "low";
  return "in";
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

/**
 * Races a promise against a timeout. try/catch/finally only release a
 * loading spinner when the underlying promise settles — a request that
 * hangs (network stall, dead connection) without ever resolving or
 * rejecting leaves `finally` unreached forever. This forces settlement.
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms = 10000, label = 'Request'): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}
