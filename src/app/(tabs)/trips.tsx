import { useEffect } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LineIcon } from "@/components/roam-ui";
import { refreshBookings, useBookings, type ConfirmedBooking } from "@/lib/bookings";
import { posthog } from "@/lib/posthog";

function BookingItem({ booking }: { booking: ConfirmedBooking }) {
  return (
    <Pressable
      accessibilityLabel={`View stay ${booking.stayTitle}`}
      onPress={() =>
        router.push({
          pathname: "/stay/[slug]",
          params: { slug: booking.staySlug },
        } as any)
      }
      style={styles.bookingCard}
    >
      <Image
        contentFit="cover"
        source={{ uri: booking.imageUrl }}
        style={styles.bookingImage}
        transition={200}
      />
      <View style={styles.bookingDetails}>
        <View style={styles.statusRow}>
          <View style={styles.confirmedBadge}>
            <Text style={styles.confirmedText}>Confirmed</Text>
          </View>
          {Boolean(booking.couponCode) && (
            <View style={styles.couponBadge}>
              <Text style={styles.couponText}>
                🏷️ {booking.couponCode} (−${booking.discountAmount || 0})
              </Text>
            </View>
          )}
          <View style={styles.testModeBadge}>
            <Text style={styles.testModeText}>Test Mode</Text>
          </View>
        </View>

        <Text numberOfLines={1} style={styles.stayTitle}>
          {booking.stayTitle}
        </Text>

        <View style={styles.metaRow}>
          <LineIcon color="#92929C" name="pin" size={13} strokeWidth={2.4} />
          <Text numberOfLines={1} style={styles.locationText}>
            {booking.location}
          </Text>
        </View>

        <View style={styles.datesRow}>
          <LineIcon color="#92929C" name="calendar" size={13} strokeWidth={2.2} />
          <Text style={styles.datesText}>
            {booking.checkInDate} – {booking.checkOutDate} ({booking.nights} {booking.nights === 1 ? "night" : "nights"})
          </Text>
        </View>

        <View style={styles.priceDivider} />

        <View style={styles.priceRow}>
          <Text style={styles.bookingRef}>Ref: {booking.id}</Text>
          <Text style={styles.priceTotal}>${booking.totalAmount}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function TripsScreen() {
  const bookings = useBookings();

  useEffect(() => {
    refreshBookings();
  }, []);

  console.log("[TripsScreen] Bookings count:", bookings.length);

  useEffect(() => {
    posthog?.capture("trips_viewed", {
      has_bookings: bookings.length > 0,
      booking_count: bookings.length,
    });
  }, [bookings.length]);

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>YOUR JOURNEYS</Text>
            <Text style={styles.title}>Trips</Text>
          </View>
          {bookings.length > 0 && (
            <View style={styles.countPill}>
              <Text style={styles.countText}>{bookings.length} upcoming</Text>
            </View>
          )}
        </View>

        {bookings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.cardTitle}>Your next chapter starts here</Text>
            <Text style={styles.copy}>
              Save a stay you love or complete a test booking to see your upcoming trips here.
            </Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={bookings}
            extraData={bookings.length}
            keyExtractor={(item, index) => item.id || item.orderId || String(index)}
            renderItem={({ item }) => <BookingItem booking={item} />}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFFFFF" },
  content: { flex: 1, paddingHorizontal: 22, paddingTop: 26 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  eyebrow: {
    color: "#8D7AB8",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 11,
    letterSpacing: 1.5,
  },
  title: {
    marginTop: 6,
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 36,
    letterSpacing: -1.8,
  },
  countPill: {
    backgroundColor: "#F2EDFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 6,
  },
  countText: {
    color: "#7755D9",
    fontFamily: "Manrope_700Bold",
    fontSize: 12,
  },
  emptyCard: {
    marginTop: 4,
    padding: 22,
    borderRadius: 22,
    backgroundColor: "#F6F5F8",
  },
  cardTitle: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 17,
  },
  copy: {
    marginTop: 7,
    color: "#777780",
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    lineHeight: 20,
  },
  listContent: {
    paddingBottom: 130,
    gap: 16,
  },
  bookingCard: {
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EBEBED",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bookingImage: {
    width: "100%",
    height: 140,
    backgroundColor: "#F0F0F3",
  },
  bookingDetails: {
    padding: 16,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  confirmedBadge: {
    backgroundColor: "#DDF4E9",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
  },
  confirmedText: {
    color: "#176B4B",
    fontFamily: "Manrope_700Bold",
    fontSize: 11,
  },
  couponBadge: {
    backgroundColor: "#E8F8EE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  couponText: {
    color: "#166534",
    fontFamily: "Manrope_700Bold",
    fontSize: 11,
  },
  testModeBadge: {
    backgroundColor: "#FFF4D4",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
  },
  testModeText: {
    color: "#976B00",
    fontFamily: "Manrope_700Bold",
    fontSize: 11,
  },
  stayTitle: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 16,
    letterSpacing: -0.4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  locationText: {
    color: "#6B6B72",
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
  },
  datesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  datesText: {
    color: "#6B6B72",
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
  },
  priceDivider: {
    height: 1,
    backgroundColor: "#F0F0F3",
    marginVertical: 12,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bookingRef: {
    color: "#9E9EAA",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  priceTotal: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 16,
  },
});
