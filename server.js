/* ================= WALLET + BANK SERVER 5003 - ERROR FREE ✅ ================= */

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
    res.json({ banks: banks || [] });
  } catch (err) {
    console.error("❌ All banks error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

/* 🔥 WITHDRAW REQUEST - SAFE VERSION (ORIGINAL COLUMNS ONLY) */
app.post("/api/withdraw-request", async (req, res) => {
  try {
    const { profile_id, amount } = req.body;
    if (!profile_id || !amount) 
      return res.status(400).json({ error: "Profile ID & amount required" });

    const cleanAmount = Number(amount);
    if (isNaN(cleanAmount) || cleanAmount < 100) 
      return res.status(400).json({ error: "Minimum ₹100" });

    // 🔥 BANK CHECK
    const { data: bankDetails, error: bankError } = await supabase
      .from("user_bank_details")
      .select("id, account_holder, account_number, bank_name, ifsc_code, is_verified")
      .eq("user_id", profile_id)
      .maybeSingle();

    if (bankError || !bankDetails) {
      return res.status(400).json({ 
        error: "❌ Bank details add karein! Profile → Bank Details",
        needBank: true 
      });
    }

    if (!bankDetails.is_verified) {
      return res.status(400).json({ 
        error: "❌ Bank not verified",
        needBank: true 
      });
    }

    // USER CHECK
    const { data: user, error: userErr } = await supabase
      .from("registeruser")
      .select("username, email, balance")
      .eq("profile_id", profile_id)
      .single();

    if (userErr || !user) return res.status(400).json({ error: "User not found" });
    if (user.balance < cleanAmount) return res.status(400).json({ error: "Insufficient balance" });

    // PENDING CHECK
    const { data: existing } = await supabase
      .from("withdraw_request")
      .select("withdraw_id")
      .eq("profile_id", profile_id)
      .eq("status", "pending");

    if (existing?.length > 0) return res.status(400).json({ error: "Already pending withdraw" });

    const withdrawId = `WD_${nanoid(8)}`;
    const oldBalance = user.balance;

    // DEDUCT BALANCE
    const { error: balanceError } = await supabase
      .from("registeruser")
      .update({ balance: user.balance - cleanAmount })
      .eq("profile_id", profile_id);

    if (balanceError) return res.status(500).json({ error: "Balance update failed" });

    // SAFE INSERT (ORIGINAL COLUMNS ONLY)
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
        bank_info: `****${bankDetails.account_number?.slice(-4)} (${bankDetails.bank_name})` // SAFE!
      });

    if (insertError) {
      // ROLLBACK
      await supabase.from("registeruser").update({ balance: oldBalance }).eq("profile_id", profile_id);
      console.error("❌ INSERT ERROR:", insertError.message);
      return res.status(500).json({ error: "Withdraw creation failed - " + insertError.message });
    }

    console.log(`✅ WITHDRAW CREATED: ${withdrawId} | ₹${cleanAmount}`);
    return res.json({ 
      success: true, 
      withdraw_id: withdrawId, 
      message: "✅ Withdraw submitted! Admin review pending."
    });
  } catch (err) {
    console.error("Withdraw Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* 🔥 ADMIN STATUS UPDATE */
app.put("/api/admin/withdraw-status/:withdrawId", async (req, res) => {
  try {
    const { withdrawId } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) 
      return res.status(400).json({ error: "Invalid status" });

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

/* 🔥 ADMIN DELETE */
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

/* 🔥 ADMIN WITHDRAW LIST */
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
    status: "🚀 SERVER 5003 LIVE ✅ - AUTO-VERIFY SAFE",
    timestamp: new Date().toLocaleString("en-IN")
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 WALLET + BANK SERVER 5003 LIVE ON PORT ${PORT}`);
  console.log(`📊 http://localhost:${PORT}/api/admin/all-banks`);
  console.log(`💰 http://localhost:${PORT}/api/admin/withdraw-requests`);
  console.log(`✅ SAFE MODE - NO COLUMN ERRORS!\n`);
});
