import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import type { PropertyType } from "./stays";

export interface ConfirmedBooking {
  id: string; // Roam confirmation reference, e.g. "ROAM-8921"
  orderId: string; // Razorpay order id
  paymentId: string; // Razorpay payment id
  stayId: string;
  staySlug: string;
  stayTitle: string;
  stayType?: PropertyType;
  location: string;
  imageUrl: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  pricePerNight: number;
  cleaningFee: number;
  discountAmount?: number;
  couponCode?: string;
  totalAmount: number; // in dollars / main currency
  currency: string;
  bookedAt: string;
}

let bookings: ConfirmedBooking[] = [];
const listeners = new Set<() => void>();
const STORAGE_KEY = "@roam_confirmed_bookings_v1";

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

async function saveToStorage() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
    console.log("[Bookings] Saved", bookings.length, "booking(s) to AsyncStorage.");
  } catch (err) {
    console.warn("[Bookings] Failed to save bookings to AsyncStorage:", err);
  }
}

async function loadFromStorage() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        bookings = parsed;
        console.log("[Bookings] Loaded", bookings.length, "booking(s) from AsyncStorage.");
        notify();
      }
    }
  } catch (err) {
    console.warn("[Bookings] Failed to load bookings from AsyncStorage:", err);
  }
}

// Initial load on app launch
loadFromStorage();

export async function refreshBookings(): Promise<ConfirmedBooking[]> {
  await loadFromStorage();
  return bookings;
}

export function getBookingsSnapshot(): ConfirmedBooking[] {
  return bookings;
}

export function subscribeBookings(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export async function addBooking(booking: ConfirmedBooking): Promise<void> {
  // Prevent duplicate additions for the same order
  if (bookings.some((b) => b.orderId === booking.orderId)) {
    console.log("[Bookings] Booking already exists with orderId:", booking.orderId);
    return;
  }
  bookings = [booking, ...bookings];
  console.log("[Bookings] Added booking:", booking.stayTitle, "| Total bookings:", bookings.length);
  notify();
  await saveToStorage();
}

export async function clearBookings(): Promise<void> {
  bookings = [];
  notify();
  await saveToStorage();
}

export function useBookings(): ConfirmedBooking[] {
  return useSyncExternalStore(
    subscribeBookings,
    getBookingsSnapshot,
    () => [] as ConfirmedBooking[],
  );
}
