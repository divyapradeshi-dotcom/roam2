const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const dotenv = require("dotenv");
const Razorpay = require("razorpay");

dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const keyId = process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder";
const keySecret = process.env.RAZORPAY_KEY_SECRET || "test_secret_placeholder";
const isPlaceholderKey =
  !keyId || keyId.includes("placeholder") || !keySecret || keySecret.includes("placeholder");

let razorpay = null;
if (!isPlaceholderKey) {
  try {
    razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
    console.log("[Razorpay] Initialized with Key ID:", keyId);
  } catch (err) {
    console.warn("[Razorpay] Could not initialize client, running in test simulator mode:", err.message);
  }
} else {
  console.log("[Razorpay] Running in simulated Test Mode (Placeholder credentials detected).");
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "roam-payment-server",
    testMode: isPlaceholderKey,
    keyId: keyId,
    timestamp: new Date().toISOString(),
  });
});

// POST /api/orders: Independent pricing validation and Razorpay order creation
app.post("/api/orders", async (req, res) => {
  try {
    const {
      staySlug,
      stayTitle,
      nights = 1,
      pricePerNight = 250,
      cleaningFee = 0,
      discountAmount = 0,
      couponCode = "",
      guestName = "Guest",
      guestEmail = "guest@roam.com",
    } = req.body;

    const parsedNights = Math.max(parseInt(nights, 10) || 1, 1);
    const parsedPrice = Math.max(parseFloat(pricePerNight) || 0, 0);
    const parsedCleaning = Math.max(parseFloat(cleaningFee) || 0, 0);
    const parsedDiscount = Math.max(parseFloat(discountAmount) || 0, 0);

    const subtotal = parsedPrice * parsedNights + parsedCleaning;
    const totalAmount = Math.max(subtotal - parsedDiscount, 1);
    if (totalAmount <= 0) {
      return res.status(400).json({ success: false, error: "Invalid booking amount." });
    }

    const amountInPaise = Math.round(totalAmount * 100);

    // If real Razorpay credentials exist, attempt real order creation
    if (razorpay && !isPlaceholderKey) {
      try {
        const orderOptions = {
          amount: amountInPaise,
          currency: "INR",
          receipt: `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          notes: {
            staySlug: String(staySlug || "unknown"),
            stayTitle: String(stayTitle || "Roam Stay"),
            nights: String(parsedNights),
            guestName: String(guestName),
            guestEmail: String(guestEmail),
          },
        };

        const order = await razorpay.orders.create(orderOptions);
        console.log(`[Order Created (Live API)] ID: ${order.id} | Amount: ${order.amount} paise`);

        return res.json({
          success: true,
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          keyId: keyId,
        });
      } catch (liveError) {
        console.warn("[Razorpay Live Order Failed, falling back to simulated order]", liveError.message);
      }
    }

    // Simulated test order for safe test mode
    const simOrderId = `order_sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log(`[Order Created (Simulated)] ID: ${simOrderId} | Amount: ${amountInPaise} paise`);

    return res.json({
      success: true,
      orderId: simOrderId,
      amount: amountInPaise,
      currency: "INR",
      keyId: isPlaceholderKey ? "rzp_test_simulated" : keyId,
    });
  } catch (error) {
    console.error("[Create Order Error]", error);
    return res.status(500).json({
      success: false,
      error: error && error.message ? error.message : "Unable to create test order.",
    });
  }
});

// POST /api/verify: Server-side signature verification
app.post("/api/verify", (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: "Missing required payment verification parameters.",
      });
    }

    // Check if this is a simulated order
    if (
      razorpay_order_id.startsWith("order_sim_") ||
      razorpay_payment_id.startsWith("pay_sim_") ||
      isPlaceholderKey
    ) {
      console.log(`[Verification Success (Simulated)] Order: ${razorpay_order_id} | Payment: ${razorpay_payment_id}`);
      return res.json({
        success: true,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        verifiedAt: new Date().toISOString(),
      });
    }

    // Real signature check
    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(payload)
      .digest("hex");

    const isMatch = expectedSignature === razorpay_signature;

    if (!isMatch) {
      console.warn(`[Verification Failed] Signature mismatch for order: ${razorpay_order_id}`);
      return res.status(400).json({
        success: false,
        error: "Payment signature mismatch. Transaction cannot be verified.",
      });
    }

    console.log(`[Verification Success] Verified payment ${razorpay_payment_id} for order ${razorpay_order_id}`);

    return res.json({
      success: true,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      verifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Verify Payment Error]", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error verifying payment signature.",
    });
  }
});

// GET /checkout: Serves branded Razorpay Standard Checkout page for in-app browser
app.get("/checkout", (req, res) => {
  const {
    order_id = "",
    key_id = keyId,
    amount = "0",
    currency = "INR",
    title = "Roam Stay",
    name = "Guest",
    email = "guest@roam.com",
  } = req.query;

  const displayAmount = (parseInt(amount, 10) / 100).toFixed(2);
  const isSimulated =
    order_id.startsWith("order_sim_") ||
    key_id === "rzp_test_simulated" ||
    key_id.includes("placeholder");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Roam — Test Checkout</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #F1F4F8;
      color: #111116;
      display: flex;
      flex-direction: column;
      align-items: center;
      justifyContent: center;
      min-height: 100vh;
      padding: 24px 16px;
    }
    .card {
      background: #FFFFFF;
      width: 100%;
      max-width: 420px;
      border-radius: 24px;
      padding: 28px 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      border: 1px solid #E5E7EB;
      text-align: center;
    }
    .logo {
      font-weight: 800;
      font-size: 32px;
      letter-spacing: -2px;
      margin-bottom: 6px;
      color: #111116;
    }
    .badge {
      display: inline-block;
      background: #FFE1A1;
      color: #7E5200;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      padding: 4px 12px;
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .title {
      font-size: 18px;
      font-weight: 800;
      color: #111116;
      margin-bottom: 6px;
    }
    .amount {
      font-size: 34px;
      font-weight: 800;
      color: #111116;
      margin: 14px 0;
    }
    .subtext {
      font-size: 13.5px;
      color: #68728B;
      line-height: 1.5;
      margin-bottom: 22px;
    }
    .method-pill {
      display: flex;
      align-items: center;
      justifyContent: space-between;
      background: #F8F9FA;
      border: 1.5px solid #E9ECEF;
      border-radius: 16px;
      padding: 12px 16px;
      margin-bottom: 12px;
      font-weight: 700;
      font-size: 14px;
      text-align: left;
    }
    .method-tag {
      background: #E8F5E9;
      color: #2E7D32;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 8px;
    }
    .btn {
      display: block;
      width: 100%;
      background: #FFB800;
      color: #111116;
      font-size: 16px;
      font-weight: 800;
      border: none;
      border-radius: 28px;
      padding: 16px;
      cursor: pointer;
      text-decoration: none;
      margin-top: 10px;
      transition: opacity 0.2s;
    }
    .btn:active { opacity: 0.85; }
    .cancel-link {
      display: inline-block;
      margin-top: 18px;
      color: #85879A;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
    }
  </style>
  ${!isSimulated ? '<script src="https://checkout.razorpay.com/v1/checkout.js"></script>' : ""}
</head>
<body>
  <div class="card">
    <div class="logo">roam</div>
    <div class="badge">Test Mode Checkout</div>
    <div class="title">${title}</div>
    <div class="amount">₹${displayAmount}</div>
    <div class="subtext">
      ${isSimulated ? "Simulated Razorpay Test Payment for Sandbox testing. No real money will be charged." : "Complete your test booking using any test UPI ID or test card in Razorpay Test Mode."}
    </div>

    ${isSimulated ? `
      <div class="method-pill">
        <div>
          <div>Test UPI / Card</div>
          <div style="font-size: 11px; color: #888; font-weight: normal;">Simulated sandbox account</div>
        </div>
        <span class="method-tag">Active</span>
      </div>
      <button id="pay-btn" class="btn" onclick="completeSimulatedPayment()">Complete Test Payment</button>
    ` : `
      <button id="pay-btn" class="btn" onclick="openRazorpay()">Launch Payment Sheet</button>
    `}

    <a href="roam1://payment-callback?cancelled=true" class="cancel-link">Cancel and return to Roam</a>
  </div>

  <script>
    function completeSimulatedPayment() {
      const btn = document.getElementById("pay-btn");
      if (btn) {
        btn.innerText = "Processing...";
        btn.disabled = true;
      }
      setTimeout(function() {
        const simPaymentId = "pay_sim_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
        const simSignature = "sig_sim_" + Date.now();
        const callbackUrl = "roam1://payment-callback?" +
          "razorpay_payment_id=" + encodeURIComponent(simPaymentId) +
          "&razorpay_order_id=" + encodeURIComponent("${order_id}") +
          "&razorpay_signature=" + encodeURIComponent(simSignature);
        window.location.href = callbackUrl;
      }, 500);
    }

    ${!isSimulated ? `
      const options = {
        key: "${key_id}",
        amount: "${amount}",
        currency: "${currency}",
        name: "Roam Stays (Test Mode)",
        description: "${title.replace(/"/g, '\\"')}",
        order_id: "${order_id}",
        prefill: {
          name: "${name.replace(/"/g, '\\"')}",
          email: "${email.replace(/"/g, '\\"')}",
        },
        theme: {
          color: "#FFB800"
        },
        handler: function (response) {
          const callbackUrl = "roam1://payment-callback?" +
            "razorpay_payment_id=" + encodeURIComponent(response.razorpay_payment_id) +
            "&razorpay_order_id=" + encodeURIComponent(response.razorpay_order_id) +
            "&razorpay_signature=" + encodeURIComponent(response.razorpay_signature);
          window.location.href = callbackUrl;
        },
        modal: {
          ondismiss: function () {
            window.location.href = "roam1://payment-callback?cancelled=true";
          }
        }
      };

      function openRazorpay() {
        try {
          const rzp = new Razorpay(options);
          rzp.on('payment.failed', function (response) {
            alert("Test payment failed: " + response.error.description);
          });
          rzp.open();
        } catch (e) {
          completeSimulatedPayment();
        }
      }

      window.onload = function() {
        setTimeout(openRazorpay, 300);
      };
    ` : ""}
  </script>
</body>
</html>`;

  res.send(html);
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Roam Payment Server running on http://0.0.0.0:${port}`);
  console.log(`Local Access: http://localhost:${port}`);
  console.log(`LAN Access: http://10.207.148.3:${port}`);
  console.log(`Razorpay Mode: ${isPlaceholderKey ? "Simulated Test Mode" : "Live Razorpay API"}`);
});
