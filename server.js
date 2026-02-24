/* ================= WALLET + BANK SERVER 5003 - FIXED ✅ ================= */

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";

const app = express();
const PORT = process.env.PORT || 5003;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

app.use(cors());
app.use(express.json());

/* 🔥 ALL BANKS - IST TIME ✅ */
app.get("/api/admin/all-banks", async (req, res) => {
  try {
    const { data: banks, error } = await supabase
      .from("user_bank_details")
      .select(`
        id,
        user_id,
        profile_name,
        account_holder,
        account_number,
        bank_name,
        ifsc_code,
        is_verified,
        created_at_ist,
        updated_at_ist
      `)
      .order("created_at_ist", { ascending: false });

    if (error) throw error;

    console.log(`✅ IST BANKS: ${banks?.length || 0}`);
    console.log("🔥 IST TIME:", banks[0]?.created_at_ist);
    res.json({ banks: banks || [] });
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* 🔥 WITHDRAW REQUEST */
app.post("/api/withdraw-request", async (req, res) => {
  try {
    const { profile_id, amount } = req.body;
    if (!profile_id || !amount) return res.status(400).json({ error: "Profile ID & amount required" });

    const cleanAmount = Number(amount);
    if (isNaN(cleanAmount) || cleanAmount < 100) return res.status(400).json({ error: "Minimum ₹100" });

    const { data: user, error: userErr } = await supabase
      .from("registeruser")
      .select("username, email, balance")
      .eq("profile_id", profile_id)
      .single();

    if (userErr || !user) return res.status(400).json({ error: "User not found" });
    if (user.balance < cleanAmount) return res.status(400).json({ error: "Insufficient balance" });

    const { data: existing } = await supabase
      .from("withdraw_request")
      .select("withdraw_id")
      .eq("profile_id", profile_id)
      .eq("status", "pending");

    if (existing?.length > 0) return res.status(400).json({ error: "Already pending withdraw" });

    const withdrawId = `WD_${nanoid(8)}`;

    const { error: balanceError } = await supabase
      .from("registeruser")
      .update({ balance: user.balance - cleanAmount })
      .eq("profile_id", profile_id);

    if (balanceError) return res.status(500).json({ error: "Balance update failed" });

    const { error: insertError } = await supabase
      .from("withdraw_request")
      .insert({
        withdraw_id: withdrawId,
        profile_id,
        profile_name: user.username || profile_id,
        user_email: user.email || "unknown",
        withdraw_amount: cleanAmount,
        status: "pending",
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      await supabase.from("registeruser").update({ balance: user.balance }).eq("profile_id", profile_id);
      return res.status(500).json({ error: "Withdraw creation failed" });
    }

    return res.json({ success: true, withdraw_id: withdrawId, message: "Withdraw submitted" });
  } catch (err) {
    console.error("Withdraw Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* 🔥 ADMIN WITHDRAW STATUS */
app.put("/api/admin/withdraw-status/:withdrawId", async (req, res) => {
  try {
    const { withdrawId } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });

    const { data: withdraw, error } = await supabase
      .from("withdraw_request")
      .select("*")
      .eq("withdraw_id", withdrawId)
      .single();

    if (error || !withdraw) return res.status(404).json({ error: "Withdraw not found" });
    if (withdraw.status !== "pending") return res.status(400).json({ error: "Already processed" });

    if (status === "rejected") {
      const { data: user } = await supabase
        .from("registeruser")
        .select("balance")
        .eq("profile_id", withdraw.profile_id)
        .single();

      await supabase
        .from("registeruser")
        .update({ balance: (user.balance || 0) + withdraw.withdraw_amount })
        .eq("profile_id", withdraw.profile_id);
    }

    await supabase
      .from("withdraw_request")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("withdraw_id", withdrawId);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* 🔥 ADMIN DELETE WITHDRAW */
app.delete("/api/admin/withdraw/:withdrawId", async (req, res) => {
  try {
    const { withdrawId } = req.params;
    const { data: withdraw, error } = await supabase
      .from("withdraw_request")
      .select("*")
      .eq("withdraw_id", withdrawId)
      .single();

    if (error || !withdraw) return res.status(404).json({ error: "Withdraw not found" });
    if (withdraw.status === "pending") return res.status(400).json({ error: "Pending delete nahi kar sakte" });

    const { error: deleteError } = await supabase
      .from("withdraw_request")
      .delete()
      .eq("withdraw_id", withdrawId);

    if (deleteError) return res.status(500).json({ error: "Delete failed" });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* 🔥 ADMIN WITHDRAW REQUESTS */
app.get("/api/admin/withdraw-requests", async (req, res) => {
  const { data } = await supabase
    .from("withdraw_request")
    .select("*")
    .order("created_at", { ascending: false });
  res.json({ withdraws: data || [] });
});

/* 🔥 HEALTH CHECK */
app.get("/health", (req, res) => {
  res.json({ 
    status: "🚀 SERVER 5003 LIVE ✅",
    timestamp: new Date().toLocaleString("en-IN"),
    routes: {
      banks: "/api/admin/all-banks",
      withdraws: "/api/admin/withdraw-requests"
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 SERVER 5003 LIVE ON PORT ${PORT}`);
  console.log(`📊 http://localhost:${PORT}/api/admin/all-banks`);
});
