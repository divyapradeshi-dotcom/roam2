import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { useAuth, useUser } from "@clerk/expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LineIcon, PressableFeedback } from "@/components/roam-ui";
import { toggleFavorite, useIsFavorite } from "@/lib/favorites";
import { useStay } from "@/hooks/use-stay";
import { posthog } from "@/lib/posthog";
import { addBooking } from "@/lib/bookings";
import {
  calculateStayDates,
  createPaymentOrder,
  launchRazorpayCheckout,
  verifyPayment,
} from "@/lib/payment";
import {
  formatHostingSince,
  formatLanguages,
  formatResponseTime,
  houseRuleLines,
} from "@/lib/stay-details";
import type { Amenity } from "@/lib/stays";

const SCREEN_WIDTH = Dimensions.get("window").width;
const GALLERY_HEIGHT = 345;

const AMENITY_DISPLAY: Record<
  string,
  { label: string; icon: "hot-tub" | "paw" | "pool" | "mountain" | "fireplace" | "wifi" }
> = {
  hotTub: { label: "Hot Tub", icon: "hot-tub" },
  pool: { label: "Pool", icon: "pool" },
  pets: { label: "Pet Friendly", icon: "paw" },
  wifi: { label: "Fast Wi-Fi", icon: "wifi" },
  fireplace: { label: "Fireplace", icon: "fireplace" },
  mountainView: { label: "Forest Views", icon: "mountain" },
  lakeView: { label: "Lake Views", icon: "mountain" },
  oceanView: { label: "Ocean Views", icon: "mountain" },
  beachAccess: { label: "Beach Access", icon: "mountain" },
};

export default function StayDetailsScreen() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const insets = useSafeAreaInsets();

  const { stay, loading, error, retry } = useStay(slug);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [policiesModalVisible, setPoliciesModalVisible] = useState(false);
  const [hostModalVisible, setHostModalVisible] = useState(false);
  const policiesScrollRef = useRef<any>(null);
  const [cancellationSectionY, setCancellationSectionY] = useState(0);

  const isFav = useIsFavorite(stay?.id ?? "");

  const handleToggleFavorite = () => {
    if (!stay) return;
    const nextState = toggleFavorite(stay.id);
    posthog?.capture(nextState ? "stay_saved" : "stay_unsaved", {
      property_id: stay.id,
      title: stay.title,
    });
  };

  const handleShare = async () => {
    if (!stay) return;
    posthog?.capture("stay_shared", { slug: stay.slug });
    try {
      await Share.share({
        message: `${stay.title} in ${stay.location}, $${stay.pricePerNight} a night on Roam`,
      });
    } catch {
      // User dismissed share sheet
    }
  };

  const { getToken } = useAuth();
  const { user } = useUser();
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [customNights, setCustomNights] = useState<number | null>(null);
  const [bookingStep, setBookingStep] = useState<"summary" | "processing" | "success" | "failure">("summary");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmedRef, setConfirmedRef] = useState<string | null>(null);

  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState("");

  const minStayNights = Math.max(stay?.minNights ?? 1, 1);
  const nightsCount = customNights ?? minStayNights;
  const stayPrice = stay ? stay.pricePerNight * nightsCount : 0;
  const cleaningFee = stay?.cleaningFee ?? 0;
  const subtotal = stayPrice + cleaningFee;
  const discountAmount = appliedCoupon ? appliedCoupon.discount : 0;
  const fullTotal = Math.max(1, subtotal - discountAmount);
  const stayDates = calculateStayDates(nightsCount);

  const handleApplyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setCouponError("Please enter a coupon code");
      return;
    }
    setCouponError("");
    if (code === "ROAM50" || code === "HOSTEL50" || code === "ROAM") {
      setAppliedCoupon({ code, discount: 50 });
    } else if (code === "SAVE20" || code === "ROAM20") {
      const disc = Math.round(subtotal * 0.2);
      setAppliedCoupon({ code, discount: Math.max(disc, 20) });
    } else if (code === "WELCOME") {
      setAppliedCoupon({ code, discount: 35 });
    } else {
      // Allow any test coupon code with $50 test discount!
      setAppliedCoupon({ code, discount: 50 });
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError("");
  };

  const handleBook = () => {
    if (!stay) return;
    posthog?.capture("stay_book_tapped", {
      slug: stay.slug,
      nights: nightsCount,
      total_amount: fullTotal,
    });
    setBookingStep("summary");
    setBookingError(null);
    setBookingModalVisible(true);
  };

  const handleProceedToPayment = async () => {
    if (!stay) return;
    setBookingStep("processing");
    setBookingError(null);

    try {
      const token = await getToken();
      const guestName = user?.fullName || user?.firstName || "Guest";
      const guestEmail = user?.primaryEmailAddress?.emailAddress || "guest@roam.com";

      const orderRes = await createPaymentOrder({
        staySlug: stay.slug,
        stayTitle: stay.title,
        nights: nightsCount,
        pricePerNight: stay.pricePerNight,
        cleaningFee,
        discountAmount,
        couponCode: appliedCoupon?.code,
        guestName,
        guestEmail,
        clerkToken: token,
      });

      posthog?.capture("booking_order_created", {
        order_id: orderRes.orderId,
        amount: orderRes.amount,
        currency: orderRes.currency,
      });

      const checkoutResult = await launchRazorpayCheckout({
        orderId: orderRes.orderId,
        amount: orderRes.amount,
        currency: orderRes.currency,
        keyId: orderRes.keyId,
        stayTitle: stay.title,
        guestName,
        guestEmail,
      });

      if (checkoutResult.type === "cancel") {
        setBookingStep("summary");
        setBookingError("Checkout was cancelled. No payment was charged.");
        return;
      }

      if (checkoutResult.type === "error") {
        setBookingStep("failure");
        setBookingError(checkoutResult.message || "Payment checkout failed.");
        return;
      }

      const verifyRes = await verifyPayment({
        razorpay_order_id: checkoutResult.orderId,
        razorpay_payment_id: checkoutResult.paymentId,
        razorpay_signature: checkoutResult.signature,
        clerkToken: token,
      });

      if (!verifyRes.success) {
        setBookingStep("failure");
        setBookingError("Payment signature verification failed. Booking not confirmed.");
        return;
      }

      posthog?.capture("booking_payment_verified", {
        order_id: checkoutResult.orderId,
        payment_id: checkoutResult.paymentId,
      });

      const refCode = `ROAM-${Math.floor(1000 + Math.random() * 9000)}`;
      setConfirmedRef(refCode);

      await addBooking({
        id: refCode,
        orderId: checkoutResult.orderId,
        paymentId: checkoutResult.paymentId,
        stayId: stay.id,
        staySlug: stay.slug,
        stayTitle: stay.title,
        stayType: stay.type,
        location: stay.location,
        imageUrl:
          stay.photos?.[0]?.url ||
          "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=1400&q=85",
        checkInDate: stayDates.checkInDate,
        checkOutDate: stayDates.checkOutDate,
        nights: nightsCount,
        pricePerNight: stay.pricePerNight,
        cleaningFee,
        discountAmount,
        couponCode: appliedCoupon?.code,
        totalAmount: fullTotal,
        currency: "USD",
        bookedAt: new Date().toISOString(),
      });

      posthog?.capture("booking_confirmed", {
        order_id: checkoutResult.orderId,
        reference: refCode,
        stay_slug: stay.slug,
        nights: nightsCount,
        total: fullTotal,
      });

      setBookingStep("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setBookingStep("failure");
      setBookingError(message);
    }
  };

  const openPolicies = (from: "ask" | "cancellation") => {
    if (!stay) return;
    posthog?.capture("stay_policies_opened", { slug: stay.slug, from });
    setPoliciesModalVisible(true);
    if (from === "cancellation" && cancellationSectionY > 0) {
      setTimeout(() => {
        policiesScrollRef.current?.scrollTo({ y: cancellationSectionY, animated: true });
      }, 150);
    }
  };

  const openHost = () => {
    if (!stay) return;
    posthog?.capture("stay_host_opened", { slug: stay.slug });
    setHostModalVisible(true);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slide = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActivePhotoIndex(slide);
  };

  // Derive 4 highlighted amenities for the icons row
  const amenityItems = useMemo(() => {
    if (!stay) return [];
    const items: { id: string; label: string; icon: "hot-tub" | "paw" | "pool" | "mountain" | "fireplace" | "wifi" }[] = [];

    // Prioritize hotTub, pool, fireplace, mountainView, etc.
    const priority: Amenity[] = ["hotTub", "pool", "fireplace", "mountainView", "lakeView", "oceanView"];
    for (const a of priority) {
      if (stay.amenities?.includes(a) && AMENITY_DISPLAY[a]) {
        items.push({ id: a, ...AMENITY_DISPLAY[a] });
      }
      if (items.length >= 2) break;
    }

    // Include Pet Friendly if allowed
    if (stay.houseRules?.petsAllowed) {
      items.push({ id: "pets", label: "Pet Friendly", icon: "paw" });
    }

    // Include Wi-Fi or next amenity
    if (stay.amenities?.includes("wifi")) {
      items.push({ id: "wifi", label: "Fast Wi-Fi", icon: "wifi" });
    }

    // Fill to 4 with other amenities
    for (const a of stay.amenities || []) {
      if (items.length >= 4) break;
      if (!items.some((i) => i.id === a) && AMENITY_DISPLAY[a]) {
        items.push({ id: a, ...AMENITY_DISPLAY[a] });
      }
    }

    // Default forest views if still < 4
    if (items.length < 4) {
      items.push({ id: "views", label: "Forest Views", icon: "mountain" });
    }

    return items.slice(0, 4);
  }, [stay]);

  const rulesList = useMemo(() => houseRuleLines(stay?.houseRules), [stay?.houseRules]);

  if (loading && !stay) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <View style={styles.skeletonHero} />
        <View style={styles.skeletonBody}>
          <View style={[styles.skeletonLine, { width: "70%", height: 26 }]} />
          <View style={[styles.skeletonLine, { width: "40%", height: 16, marginTop: 12 }]} />
          <View style={[styles.skeletonLine, { width: "100%", height: 60, marginTop: 24 }]} />
          <View style={[styles.skeletonLine, { width: "100%", height: 75, marginTop: 16 }]} />
          <View style={[styles.skeletonLine, { width: "100%", height: 75, marginTop: 12 }]} />
        </View>
      </View>
    );
  }

  if (error && !stay) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar style="dark" />
        <PressableFeedback
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[styles.floatingBackButton, { top: insets.top + 10, left: 16 }]}
        >
          <LineIcon color="#111116" name="chevron-left" size={22} strokeWidth={2.4} />
        </PressableFeedback>
        <Text style={styles.errorTitle}>Unable to load stay</Text>
        <Text style={styles.errorCopy}>Check your connection and try again.</Text>
        <PressableFeedback
          accessibilityLabel="Try again"
          onPress={retry}
          style={styles.retryButton}
        >
          <Text style={styles.retryText}>Try again</Text>
        </PressableFeedback>
      </View>
    );
  }

  if (!stay) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar style="dark" />
        <PressableFeedback
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[styles.floatingBackButton, { top: insets.top + 10, left: 16 }]}
        >
          <LineIcon color="#111116" name="chevron-left" size={22} strokeWidth={2.4} />
        </PressableFeedback>
        <Text style={styles.errorTitle}>Stay not found</Text>
        <Text style={styles.errorCopy}>This stay is no longer available.</Text>
      </View>
    );
  }

  const photos =
    stay.photos && stay.photos.length > 0
      ? stay.photos
      : [
          {
            url: "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=1400&q=85",
            alt: stay.title,
          },
        ];
  const hostFirstName = stay.host?.name ? stay.host.name.split(" ")[0] : "Alex";

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        {/* Photo Gallery with Paging */}
        <View style={styles.galleryContainer}>
          <FlatList
            data={photos}
            horizontal
            keyExtractor={(_, index) => `photo-${index}`}
            onMomentumScrollEnd={handleScroll}
            pagingEnabled
            renderItem={({ item }) => (
              <Image
                accessibilityLabel={item.alt || stay.title}
                contentFit="cover"
                source={{ uri: item.url }}
                style={styles.galleryPhoto}
                transition={200}
              />
            )}
            showsHorizontalScrollIndicator={false}
          />

          {/* Floating Action Buttons */}
          <View style={[styles.galleryTopRow, { top: insets.top + 8 }]}>
            <PressableFeedback
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              style={styles.circleActionButton}
            >
              <LineIcon color="#111116" name="chevron-left" size={22} strokeWidth={2.4} />
            </PressableFeedback>

            <View style={styles.galleryTopRightButtons}>
              <PressableFeedback
                accessibilityLabel="Share stay"
                onPress={handleShare}
                style={styles.circleActionButton}
              >
                <LineIcon color="#111116" name="share" size={20} strokeWidth={2.2} />
              </PressableFeedback>

              <PressableFeedback
                accessibilityLabel={isFav ? "Remove from saved" : "Save stay"}
                onPress={handleToggleFavorite}
                style={[styles.circleActionButton, isFav && styles.circleActionButtonFav]}
              >
                <LineIcon
                  color={isFav ? "#FF3B30" : "#111116"}
                  name={isFav ? "heart-fill" : "heart"}
                  size={20}
                  strokeWidth={2.2}
                />
              </PressableFeedback>
            </View>
          </View>

          {/* Photo Counter Pill */}
          <View style={styles.counterPill}>
            <Text style={styles.counterText}>
              {activePhotoIndex + 1} / {photos.length > 3 ? photos.length : 24}
            </Text>
          </View>
        </View>

        {/* Sheet Content Body */}
        <View style={styles.sheetBody}>
          {/* Title & Rating Box Row */}
          <View style={styles.titleRow}>
            <Text style={styles.stayTitle}>{stay.title}</Text>
            <View style={styles.ratingBox}>
              <View style={styles.ratingScoreRow}>
                <LineIcon color="#FFB000" name="star" size={17} />
                <Text style={styles.ratingScoreText}>{stay.ratingText || "4.9"}</Text>
              </View>
              <Text style={styles.ratingCountText}>({stay.reviewCount || 342})</Text>
            </View>
          </View>

          {/* Location Row */}
          <View style={styles.locationRow}>
            <LineIcon color="#111116" name="pin" size={18} strokeWidth={2.4} />
            <Text style={styles.locationText}>{stay.location}</Text>
          </View>

          {/* Amenity Highlights Row */}
          <View style={styles.amenitiesRow}>
            {amenityItems.map((item) => (
              <View key={item.id} style={styles.amenityCol}>
                <View style={styles.amenityIconContainer}>
                  <LineIcon color="#111116" name={item.icon} size={26} strokeWidth={2} />
                </View>
                <Text numberOfLines={1} style={styles.amenityLabel}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.divider} />

          {/* Policy Card 1: Ask about policies */}
          <PressableFeedback
            accessibilityLabel="Ask about policies"
            onPress={() =>
              router.push({
                pathname: "/stay/[slug]/ask",
                params: { slug: stay.slug },
              } as any)
            }
            style={styles.policyCard}
          >
            <View style={styles.policyIconTile}>
              <LineIcon color="#693BFF" name="chat" size={24} strokeWidth={2.2} />
            </View>
            <View style={styles.policyTextCol}>
              <Text style={styles.policyCardTitle}>Ask about policies</Text>
              <Text style={styles.policyCardSubtitle}>
                Cancellation, house rules, pets, check-in and more.
              </Text>
            </View>
            <LineIcon color="#693BFF" name="chevron-right" size={18} strokeWidth={2.4} />
          </PressableFeedback>

          {/* Policy Card 2: Cancellation Policy */}
          <PressableFeedback
            accessibilityLabel="View cancellation policy"
            onPress={() => openPolicies("cancellation")}
            style={[styles.policyCard, { marginTop: 12 }]}
          >
            <View style={styles.policyIconTile}>
              <LineIcon color="#693BFF" name="policy" size={24} strokeWidth={2.2} />
            </View>
            <View style={styles.policyTextCol}>
              <Text style={styles.policyCardTitle}>
                {stay.cancellationPolicy?.title || "Free cancellation"}
              </Text>
              <Text style={styles.policyCardSubtitle}>
                {stay.cancellationPolicy?.summary || "Full refund up to 7 days before check-in."}
              </Text>
            </View>
            <LineIcon color="#693BFF" name="chevron-right" size={18} strokeWidth={2.4} />
          </PressableFeedback>

          <View style={[styles.divider, { marginTop: 18 }]} />

          {/* Host Row */}
          <PressableFeedback
            accessibilityLabel={`About host ${hostFirstName}`}
            onPress={openHost}
            style={styles.hostRow}
          >
            <View style={styles.hostAvatar}>
              <Image
                accessibilityLabel={stay.host?.name || "Host photo"}
                contentFit="cover"
                source={{
                  uri:
                    stay.host?.photoUrl ||
                    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&h=160&q=80",
                }}
                style={styles.hostAvatarImage}
              />
            </View>
            <View style={styles.hostInfoCol}>
              <Text style={styles.hostName}>Hosted by {hostFirstName}</Text>
              <View style={styles.superhostBadgeRow}>
                <LineIcon color="#9C6B1F" name="rosette" size={15} strokeWidth={2.2} />
                <Text style={styles.superhostText}>Superhost</Text>
              </View>
            </View>
            <LineIcon color="#111116" name="chevron-right" size={18} strokeWidth={2.4} />
          </PressableFeedback>
        </View>
      </ScrollView>

      {/* Fixed Bottom Price Bar */}
      <View style={[styles.priceBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={styles.priceCol}>
          <View style={styles.priceMainLine}>
            <Text style={styles.priceMainAmount}>${stay.pricePerNight}</Text>
            <Text style={styles.priceMainUnit}> / night</Text>
          </View>
          <Text style={styles.priceTotalLine}>
            ${fullTotal} total · {nightsCount} {nightsCount === 1 ? "night" : "nights"}
          </Text>
        </View>

        <PressableFeedback
          accessibilityLabel="Book this stay"
          onPress={handleBook}
          style={styles.bookButton}
        >
          <Text style={styles.bookButtonText}>Book this stay</Text>
        </PressableFeedback>
      </View>

      {/* Policies Sheet Modal */}
      <Modal
        animationType="slide"
        onRequestClose={() => setPoliciesModalVisible(false)}
        transparent
        visible={policiesModalVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: "88%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Policies</Text>
              <PressableFeedback
                accessibilityLabel="Close"
                onPress={() => setPoliciesModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>×</Text>
              </PressableFeedback>
            </View>

            <ScrollView
              ref={policiesScrollRef}
              contentContainerStyle={styles.policiesSheetContent}
              showsVerticalScrollIndicator={false}
            >
              {/* House Rules */}
              <View style={styles.policySection}>
                <Text style={styles.policySectionTitle}>House rules</Text>
                {rulesList.map((rule, idx) => (
                  <View key={idx} style={styles.ruleBulletRow}>
                    <Text style={styles.ruleBullet}>•</Text>
                    <Text style={styles.ruleText}>{rule}</Text>
                  </View>
                ))}
              </View>

              {/* Cancellation Policy */}
              <View
                onLayout={(e) => setCancellationSectionY(e.nativeEvent.layout.y)}
                style={[styles.policySection, { marginTop: 24 }]}
              >
                <Text style={styles.policySectionTitle}>
                  {stay.cancellationPolicy?.title || "Cancellation policy"}
                </Text>
                <Text style={styles.policySummaryText}>
                  {stay.cancellationPolicy?.summary}
                </Text>
                <Text style={styles.policyBodyText}>
                  {stay.cancellationPolicy?.body}
                </Text>
              </View>

              {/* Other Shared Policies */}
              {stay.policies?.map((policy) => (
                <View key={policy.title} style={[styles.policySection, { marginTop: 24 }]}>
                  <Text style={styles.policySectionTitle}>{policy.title}</Text>
                  <Text style={styles.policyBodyText}>{policy.body}</Text>
                </View>
              ))}

              <Text style={styles.policyFootnote}>
                These are Roam&apos;s policies and this stay&apos;s own rules, shown as written. Questions? Contact Roam support.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Host Sheet Modal */}
      <Modal
        animationType="slide"
        onRequestClose={() => setHostModalVisible(false)}
        transparent
        visible={hostModalVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: "75%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>About the host</Text>
              <PressableFeedback
                accessibilityLabel="Close"
                onPress={() => setHostModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>×</Text>
              </PressableFeedback>
            </View>

            <ScrollView
              contentContainerStyle={styles.hostSheetContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.hostHeaderRow}>
                <View style={styles.hostLargeAvatar}>
                  <Image
                    contentFit="cover"
                    source={{
                      uri:
                        stay.host?.photoUrl ||
                        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&h=160&q=80",
                    }}
                    style={styles.hostAvatarImage}
                  />
                </View>
                <View style={styles.hostHeaderDetails}>
                  <Text style={styles.hostHeaderName}>{stay.host?.name || "Alex"}</Text>
                  <View style={styles.superhostBadgeRow}>
                    <LineIcon color="#9C6B1F" name="rosette" size={16} strokeWidth={2.2} />
                    <Text style={styles.superhostText}>Superhost</Text>
                  </View>
                </View>
              </View>

              {Boolean(stay.host?.bio) && (
                <Text style={styles.hostBioText}>{stay.host?.bio}</Text>
              )}

              <View style={styles.hostFactsContainer}>
                {Boolean(stay.host?.hostingSince) && (
                  <Text style={styles.hostFactLine}>
                    {formatHostingSince(stay.host?.hostingSince)}
                  </Text>
                )}
                {Boolean(stay.host?.responseTime) && (
                  <Text style={styles.hostFactLine}>
                    {formatResponseTime(stay.host?.responseTime)}
                  </Text>
                )}
                {Boolean(stay.host?.languages && stay.host.languages.length > 0) && (
                  <Text style={styles.hostFactLine}>
                    {formatLanguages(stay.host?.languages)}
                  </Text>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Booking Checkout Modal */}
      <Modal
        animationType="slide"
        onRequestClose={() => {
          if (bookingStep !== "processing") setBookingModalVisible(false);
        }}
        transparent
        visible={bookingModalVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: "92%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {bookingStep === "success" ? "Booking Confirmed" : "Confirm your trip"}
              </Text>
              {bookingStep !== "processing" && (
                <PressableFeedback
                  accessibilityLabel="Close"
                  onPress={() => setBookingModalVisible(false)}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>×</Text>
                </PressableFeedback>
              )}
            </View>

            <ScrollView
              contentContainerStyle={styles.bookingSheetContent}
              showsVerticalScrollIndicator={false}
            >
              {bookingStep === "processing" ? (
                <View style={styles.processingContainer}>
                  <ActivityIndicator color="#FFB000" size="large" />
                  <Text style={styles.processingTitle}>Securing your stay...</Text>
                  <Text style={styles.processingSubtitle}>
                    Preparing Razorpay test checkout. Please do not close this window.
                  </Text>
                </View>
              ) : bookingStep === "success" ? (
                <View style={styles.successContainer}>
                  <View style={styles.successIconBadge}>
                    <Text style={styles.successCheckmark}>✓</Text>
                  </View>
                  <Text style={styles.successHeading}>You&apos;re all set!</Text>
                  <Text style={styles.successSubheading}>
                    Your stay at {stay.title} is confirmed.
                  </Text>

                  <View style={styles.confirmationBox}>
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmLabel}>Confirmation code</Text>
                      <Text style={styles.confirmValueBold}>{confirmedRef}</Text>
                    </View>
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmLabel}>Dates</Text>
                      <Text style={styles.confirmValue}>{stayDates.rangeText}</Text>
                    </View>
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmLabel}>Duration</Text>
                      <Text style={styles.confirmValue}>
                        {nightsCount} {nightsCount === 1 ? "night" : "nights"}
                      </Text>
                    </View>
                    <View style={styles.confirmRow}>
                      <Text style={styles.confirmLabel}>Total paid (Test)</Text>
                      <Text style={styles.confirmValueBold}>${fullTotal}</Text>
                    </View>
                  </View>

                  <View style={styles.testSuccessNote}>
                    <Text style={styles.testSuccessNoteText}>
                      ⚡ This test booking has been added to your in-memory Trips tab for this session.
                    </Text>
                  </View>

                  <PressableFeedback
                    accessibilityLabel="View in Trips"
                    onPress={() => {
                      setBookingModalVisible(false);
                      router.navigate("/trips" as any);
                    }}
                    style={styles.primaryActionButton}
                  >
                    <Text style={styles.primaryActionButtonText}>View in Trips</Text>
                  </PressableFeedback>

                  <PressableFeedback
                    accessibilityLabel="Done"
                    onPress={() => setBookingModalVisible(false)}
                    style={styles.secondaryActionButton}
                  >
                    <Text style={styles.secondaryActionButtonText}>Done</Text>
                  </PressableFeedback>
                </View>
              ) : (
                /* Summary / Failure Step */
                <View style={styles.summaryContainer}>
                  {Boolean(bookingError) && (
                    <View style={styles.errorBanner}>
                      <Text style={styles.errorBannerText}>{bookingError}</Text>
                    </View>
                  )}

                  {/* Stay Snippet Card */}
                  <View style={styles.staySnippetCard}>
                    <Image
                      contentFit="cover"
                      source={{
                        uri:
                          stay.photos?.[0]?.url ||
                          "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=600&q=80",
                      }}
                      style={styles.staySnippetImage}
                    />
                    <View style={styles.staySnippetDetails}>
                      <Text numberOfLines={2} style={styles.staySnippetTitle}>
                        {stay.title}
                      </Text>
                      <Text numberOfLines={1} style={styles.staySnippetLocation}>
                        {stay.location}
                      </Text>
                    </View>
                  </View>

                  {/* Dates & Duration Stepper */}
                  <View style={styles.durationCard}>
                    <View style={styles.durationHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.durationLabel}>Dates</Text>
                        <Text style={styles.durationDates}>{stayDates.rangeText}</Text>
                      </View>
                      <View style={styles.stepperContainer}>
                        <PressableFeedback
                          accessibilityLabel="Decrease nights"
                          onPress={() => {
                            setCustomNights(Math.max(minStayNights, nightsCount - 1));
                          }}
                          style={[
                            styles.stepperBtn,
                            nightsCount <= minStayNights && styles.stepperBtnDisabled,
                          ]}
                        >
                          <Text style={styles.stepperBtnText}>−</Text>
                        </PressableFeedback>
                        <Text style={styles.stepperValue}>
                          {nightsCount} {nightsCount === 1 ? "night" : "nights"}
                        </Text>
                        <PressableFeedback
                          accessibilityLabel="Increase nights"
                          onPress={() => setCustomNights(Math.min(30, nightsCount + 1))}
                          style={styles.stepperBtn}
                        >
                          <Text style={styles.stepperBtnText}>+</Text>
                        </PressableFeedback>
                      </View>
                    </View>
                  </View>

                  {/* Coupon / Promo Code Card */}
                  <View style={styles.couponCard}>
                    <Text style={styles.couponCardTitle}>Coupon / Promo code</Text>
                    {appliedCoupon ? (
                      <View style={styles.appliedCouponRow}>
                        <View style={styles.appliedCouponBadge}>
                          <Text style={styles.appliedCouponTag}>🏷️ {appliedCoupon.code}</Text>
                          <Text style={styles.appliedCouponSavings}>−${appliedCoupon.discount} off</Text>
                        </View>
                        <PressableFeedback
                          accessibilityLabel="Remove coupon"
                          onPress={handleRemoveCoupon}
                          style={styles.removeCouponBtn}
                        >
                          <Text style={styles.removeCouponBtnText}>Remove</Text>
                        </PressableFeedback>
                      </View>
                    ) : (
                      <View style={styles.couponInputRow}>
                        <TextInput
                          accessibilityLabel="Enter coupon code"
                          autoCapitalize="characters"
                          onChangeText={(text) => {
                            setCouponInput(text);
                            if (couponError) setCouponError("");
                          }}
                          placeholder="e.g. ROAM50, SAVE20"
                          placeholderTextColor="#9A9AA2"
                          style={styles.couponInputField}
                          value={couponInput}
                        />
                        <PressableFeedback
                          accessibilityLabel="Apply coupon"
                          onPress={handleApplyCoupon}
                          style={styles.applyCouponBtn}
                        >
                          <Text style={styles.applyCouponBtnText}>Apply</Text>
                        </PressableFeedback>
                      </View>
                    )}
                    {Boolean(couponError) && (
                      <Text style={styles.couponErrorText}>{couponError}</Text>
                    )}
                  </View>

                  {/* Price Breakdown */}
                  <View style={styles.priceBreakdownCard}>
                    <Text style={styles.priceBreakdownTitle}>Price details</Text>
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>
                        ${stay.pricePerNight} × {nightsCount} nights
                      </Text>
                      <Text style={styles.breakdownValue}>${stayPrice}</Text>
                    </View>
                    {cleaningFee > 0 && (
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Cleaning fee</Text>
                        <Text style={styles.breakdownValue}>${cleaningFee}</Text>
                      </View>
                    )}
                    {discountAmount > 0 && (
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownDiscountLabel}>
                          Coupon discount ({appliedCoupon?.code})
                        </Text>
                        <Text style={styles.breakdownDiscountValue}>−${discountAmount}</Text>
                      </View>
                    )}
                    <View style={styles.breakdownDivider} />
                    <View style={styles.breakdownTotalRow}>
                      <Text style={styles.breakdownTotalLabel}>Total (USD)</Text>
                      <Text style={styles.breakdownTotalValue}>${fullTotal}</Text>
                    </View>
                  </View>

                  {/* Test Mode Reassurance Banner */}
                  <View style={styles.testModeBanner}>
                    <View style={styles.testModePill}>
                      <Text style={styles.testModePillText}>Test Mode</Text>
                    </View>
                    <Text style={styles.testModeDisclaimer}>
                      This is a test payment simulation powered by Razorpay. No real money will be charged. Supports test UPI and Cards.
                    </Text>
                  </View>

                  {/* Primary CTA */}
                  <PressableFeedback
                    accessibilityLabel="Pay with Razorpay"
                    onPress={handleProceedToPayment}
                    style={styles.primaryActionButton}
                  >
                    <Text style={styles.primaryActionButtonText}>
                      Pay ${fullTotal} with Razorpay
                    </Text>
                  </PressableFeedback>

                  <PressableFeedback
                    accessibilityLabel="Cancel"
                    onPress={() => setBookingModalVisible(false)}
                    style={styles.secondaryActionButton}
                  >
                    <Text style={styles.secondaryActionButtonText}>Cancel</Text>
                  </PressableFeedback>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingBottom: 120,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  skeletonHero: {
    width: "100%",
    height: GALLERY_HEIGHT,
    backgroundColor: "#F2F2F4",
  },
  skeletonBody: {
    padding: 20,
  },
  skeletonLine: {
    borderRadius: 8,
    backgroundColor: "#F2F2F4",
  },
  errorContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 20,
    marginTop: 16,
  },
  errorCopy: {
    color: "#85858E",
    fontFamily: "Manrope_500Medium",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: "#111116",
  },
  retryText: {
    color: "#FFFFFF",
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
  },
  floatingBackButton: {
    position: "absolute",
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  galleryContainer: {
    width: "100%",
    height: GALLERY_HEIGHT,
    position: "relative",
  },
  galleryPhoto: {
    width: SCREEN_WIDTH,
    height: GALLERY_HEIGHT,
    backgroundColor: "#E5E5EA",
  },
  galleryTopRow: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  circleActionButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  circleActionButtonFav: {
    backgroundColor: "#FFF0F0",
  },
  galleryTopRightButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  counterPill: {
    position: "absolute",
    right: 16,
    bottom: 24,
    height: 32,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "rgba(17, 17, 22, 0.78)",
  },
  counterText: {
    color: "#FFFFFF",
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
  },
  sheetBody: {
    marginTop: -16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  stayTitle: {
    flex: 1,
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -0.8,
  },
  ratingBox: {
    minWidth: 74,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#F4F5F7",
  },
  ratingScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingScoreText: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 17,
  },
  ratingCountText: {
    color: "#85858E",
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    marginTop: 2,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  locationText: {
    color: "#111116",
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
  },
  amenitiesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
  },
  amenityCol: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 2,
  },
  amenityIconContainer: {
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  amenityLabel: {
    marginTop: 6,
    color: "#111116",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
    textAlign: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E8E8ED",
    marginTop: 22,
    marginBottom: 14,
  },
  policyCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "#F4F0FF",
    gap: 12,
  },
  policyIconTile: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#E6DCFF",
  },
  policyTextCol: {
    flex: 1,
  },
  policyCardTitle: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 16,
  },
  policyCardSubtitle: {
    color: "#68728B",
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  hostRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 14,
  },
  hostAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: "hidden",
    backgroundColor: "#FFE1A1",
  },
  hostAvatarImage: {
    width: "100%",
    height: "100%",
  },
  hostInfoCol: {
    flex: 1,
  },
  hostName: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 16,
  },
  superhostBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  superhostText: {
    color: "#85858E",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13,
  },
  priceBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EAEAEA",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 8,
  },
  priceCol: {
    flex: 1,
    paddingRight: 12,
  },
  priceMainLine: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  priceMainAmount: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 24,
    letterSpacing: -0.6,
  },
  priceMainUnit: {
    color: "#85858E",
    fontFamily: "Manrope_500Medium",
    fontSize: 14,
  },
  priceTotalLine: {
    color: "#85858E",
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    marginTop: 1,
  },
  bookButton: {
    height: 54,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 27,
    backgroundColor: "#FFB000",
  },
  bookButtonText: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 16,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(17, 17, 22, 0.4)",
  },
  modalSheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: "#FFFFFF",
    paddingTop: 18,
    paddingBottom: 28,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EAEAEA",
  },
  modalTitle: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 20,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#F1F1F3",
  },
  modalCloseText: {
    color: "#111116",
    fontFamily: "Manrope_500Medium",
    fontSize: 24,
    marginTop: -2,
  },
  policiesSheetContent: {
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  policySection: {
    marginBottom: 8,
  },
  policySectionTitle: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 17,
    marginBottom: 8,
  },
  policySummaryText: {
    color: "#111116",
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
    marginBottom: 6,
  },
  policyBodyText: {
    color: "#555560",
    fontFamily: "Manrope_500Medium",
    fontSize: 14,
    lineHeight: 20,
  },
  ruleBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
    gap: 8,
  },
  ruleBullet: {
    color: "#693BFF",
    fontSize: 16,
    lineHeight: 20,
  },
  ruleText: {
    flex: 1,
    color: "#222228",
    fontFamily: "Manrope_500Medium",
    fontSize: 14,
    lineHeight: 20,
  },
  policyFootnote: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EAEAEA",
    color: "#85858E",
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 17,
  },
  hostSheetContent: {
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  hostHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 16,
  },
  hostLargeAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    overflow: "hidden",
    backgroundColor: "#FFE1A1",
  },
  hostHeaderDetails: {
    flex: 1,
  },
  hostHeaderName: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 22,
  },
  hostBioText: {
    color: "#33333C",
    fontFamily: "Manrope_500Medium",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  hostFactsContainer: {
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EAEAEA",
  },
  hostFactLine: {
    color: "#68728B",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 14,
  },
  bookingSheetContent: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    paddingBottom: 36,
  },
  processingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 44,
  },
  processingTitle: {
    marginTop: 18,
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 19,
  },
  processingSubtitle: {
    marginTop: 8,
    textAlign: "center",
    color: "#777782",
    fontFamily: "Manrope_500Medium",
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 280,
  },
  successContainer: {
    alignItems: "center",
    paddingVertical: 12,
  },
  successIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#DDF4E9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successCheckmark: {
    color: "#176B4B",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 28,
  },
  successHeading: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 24,
    letterSpacing: -0.6,
  },
  successSubheading: {
    marginTop: 6,
    textAlign: "center",
    color: "#6B6B72",
    fontFamily: "Manrope_500Medium",
    fontSize: 14,
    lineHeight: 20,
  },
  confirmationBox: {
    width: "100%",
    backgroundColor: "#F8F9FB",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#EAEAEA",
    padding: 16,
    marginTop: 20,
    gap: 10,
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  confirmLabel: {
    color: "#7E7E88",
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
  },
  confirmValue: {
    color: "#111116",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13,
  },
  confirmValueBold: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 14,
  },
  testSuccessNote: {
    width: "100%",
    backgroundColor: "#FFF9EB",
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#FFE6AA",
  },
  testSuccessNoteText: {
    color: "#8C6300",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
    lineHeight: 17,
  },
  summaryContainer: {
    gap: 14,
  },
  errorBanner: {
    backgroundColor: "#FFE3EA",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FFCCD6",
  },
  errorBannerText: {
    color: "#C62C4B",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
  },
  staySnippetCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F9FB",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#EBEBED",
    gap: 12,
  },
  staySnippetImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#ECECEC",
  },
  staySnippetDetails: {
    flex: 1,
    gap: 4,
  },
  staySnippetTitle: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 14,
    lineHeight: 18,
  },
  staySnippetLocation: {
    color: "#787882",
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
  },
  durationCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EBEBED",
  },
  durationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  durationLabel: {
    color: "#7E7E88",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  durationDates: {
    marginTop: 3,
    color: "#111116",
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 24,
    padding: 4,
    gap: 10,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperBtnText: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 16,
    lineHeight: 18,
  },
  stepperValue: {
    color: "#111116",
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
  },
  couponCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EBEBED",
    marginBottom: 12,
  },
  couponCardTitle: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 14,
    marginBottom: 10,
  },
  couponInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  couponInputField: {
    flex: 1,
    height: 44,
    backgroundColor: "#F4F5F7",
    borderRadius: 12,
    paddingHorizontal: 12,
    color: "#111116",
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
  },
  applyCouponBtn: {
    height: 44,
    paddingHorizontal: 16,
    backgroundColor: "#111116",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  applyCouponBtnText: {
    color: "#FFFFFF",
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
  },
  appliedCouponRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#E8F8EE",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  appliedCouponBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  appliedCouponTag: {
    color: "#166534",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 13,
  },
  appliedCouponSavings: {
    color: "#15803D",
    fontFamily: "Manrope_700Bold",
    fontSize: 12.5,
  },
  removeCouponBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  removeCouponBtnText: {
    color: "#B91C1C",
    fontFamily: "Manrope_700Bold",
    fontSize: 12,
  },
  couponErrorText: {
    marginTop: 6,
    color: "#DC2626",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
  },
  breakdownDiscountLabel: {
    color: "#16A34A",
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
  },
  breakdownDiscountValue: {
    color: "#16A34A",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 13,
  },
  priceBreakdownCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EBEBED",
    gap: 10,
  },
  priceBreakdownTitle: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 15,
    marginBottom: 4,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  breakdownLabel: {
    color: "#6B6B72",
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
  },
  breakdownValue: {
    color: "#111116",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: "#F0F0F3",
    marginVertical: 4,
  },
  breakdownTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 2,
  },
  breakdownTotalLabel: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 15,
  },
  breakdownTotalValue: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 17,
  },
  testModeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F6F5F8",
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  testModePill: {
    backgroundColor: "#FFE1A1",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  testModePillText: {
    color: "#7E5200",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 10,
    textTransform: "uppercase",
  },
  testModeDisclaimer: {
    flex: 1,
    color: "#6B6B72",
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 17,
  },
  primaryActionButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFB000",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  primaryActionButtonText: {
    color: "#111116",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 15,
  },
  secondaryActionButton: {
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionButtonText: {
    color: "#777782",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 14,
  },
});
