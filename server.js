/* WALLET SERVER 5003 - 100% FIXED ✅ NO RELATIONSHIP ERRORS */
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";

const app = express();
const PORT = process.env.PORT || 5003;

/* ============================= SUPABASE ✅ ============================ */
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey || !supabaseUrl) {
  console.log("❌ SUPABASE KEYS missing! Check .env file");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

/* ============================= MIDDLEWARE ============================ */
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] }));
app.use(express.json({ limit: "10mb" }));

// ===== BANK ENDPOINTS (UNCHANGED) =====
app.get("/api/bank-details/:profileId", async (req, res) => {
  try {
    const { profileId } = req.params;
    const { data, error } = await supabase
      .from("user_bank_details")
      .select("*")
      .eq("user_id", profileId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({
      bank: data || null,
      verified: data?.is_verified === true,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/verify-bank/:profileId", async (req, res) => {
  try {
    const { profileId } = req.params;
    const { data, error } = await supabase
      .from("user_bank_details")
      .update({ is_verified: true, is_active: true, verified_by: "admin" })
      .eq("user_id", profileId)
      .select()
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({
      success: true,
      message: `✅ Bank verified for ${profileId}`,
      data,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/reject-bank/:profileId", async (req, res) => {
  try {
    const { profileId } = req.params;
    const { data, error } = await supabase
      .from("user_bank_details")
      .update({ is_verified: false, is_active: false, verified_by: null })
      .eq("user_id", profileId)
      .select()
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({
      success: true,
      message: `❌ Bank rejected for ${profileId}`,
      data,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 🔥 FIXED - NO JOIN, SEPARATE QUERIES
app.get("/api/admin/all-banks", async (req, res) => {
  try {
    console.log("🏦 Fetching all banks...");
    
    // 1. Get all bank details
    const { data: banks, error: bankError } = await supabase
      .from("user_bank_details")
      .select(`
        *,
        id,
        user_id,
        bank_name,
        account_holder,
        account_number,
        upi_id,
        ifsc,
        branch,
        is_verified,
        is_active,
        created_at,
        updated_at
      `)
      .order("created_at", { ascending: false });

    if (bankError) {
      console.error("Bank error:", bankError);
      return res.status(500).json({ error: bankError.message });
    }

    // 2. Get user details for all banks
    const userIds = banks.map(bank => bank.user_id).filter(Boolean);
    let users = [];
    
    if (userIds.length > 0) {
      const { data: userData } = await supabase
        .from("registeruser")
        .select("profile_id, username")
        .in("profile_id", userIds);
      
      users = userData || [];
    }

    // 3. Combine banks + users
    const banksWithUsers = banks.map(bank => {
      const user = users.find(u => u.profile_id === bank.user_id);
      return {
        ...bank,
        user: {
          username: user?.username || bank.user_id || "Unknown User",
          profile_id: bank.user_id
        }
      };
    });

    const pending = banksWithUsers.filter(b => b.is_verified !== true);
    const verified = banksWithUsers.filter(b => b.is_verified === true);

    console.log(`✅ ${banksWithUsers.length} banks loaded | ⏳ Pending: ${pending.length} | ✅ Verified: ${verified.length}`);

    return res.json({
      pending: pending.length,
      verified: verified.length,
      banks: banksWithUsers || []
    });
  } catch (err) {
    console.error("❌ All banks error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// 🔥 NEW ENDPOINT - Single user banks
app.get("/api/admin/user-banks/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    const { data: banks } = await supabase
      .from("user_bank_details")
      .select("*")
      .eq("user_id", userId);

    const { data: user } = await supabase
      .from("registeruser")
      .select("profile_id, username")
      .eq("profile_id", userId)
      .maybeSingle();

    const banksWithUser = (banks || []).map(bank => ({
      ...bank,
      user: {
        username: user?.username || userId,
        profile_id: userId
      }
    }));

    return res.json({
      banks: banksWithUser,
      user: user || { username: userId, profile_id: userId }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ============================= 🔥 WITHDRAW REQUESTS ============================ */
app.post("/api/withdraw-request", async (req, res) => {
  console.log("💰 WITHDRAW REQUEST:", req.body);
  
  try {
    const { profile_id, amount, bank_details } = req.body;

    if (!profile_id || !amount) {
      return res.status(400).json({ error: "Profile ID aur amount missing!" });
    }

    const cleanAmount = Number(amount);
    if (isNaN(cleanAmount) || cleanAmount < 100) {
      return res.status(400).json({ error: "Minimum ₹100 withdraw!" });
    }

    const { data: bank } = await supabase
      .from("user_bank_details")
      .select("is_verified, is_active")
      .eq("user_id", profile_id)
      .maybeSingle();

    if (!bank?.is_verified || bank?.is_active !== true) {
      return res.status(400).json({ error: "💳 Bank verify karwao pehle!" });
    }

    const withdrawId = `WD_${nanoid(8)}`;
    const { data: user } = await supabase
      .from("registeruser")
      .select("username, email")
      .eq("profile_id", profile_id)
      .single();

    const { data, error } = await supabase
      .from("withdraw_request")
      .insert({
        withdraw_id: withdrawId,
        profile_id,
        profile_name: user?.username || profile_id,
        user_email: user?.email || bank_details?.email || "user@bgmi.com",
        withdraw_amount: cleanAmount,
        bank_details: bank_details || {},
        status: "pending"
      })
      .select()
      .single();

    if (error) {
      console.error("❌ Insert error:", error);
      return res.status(400).json({ error: error.message });
    }

    console.log("✅ WITHDRAW SAVED:", withdrawId);
    return res.json({
      success: true,
      withdraw_id: withdrawId,
      message: "✅ Withdraw request bhej diya! Admin 24hr me process karega",
      data,
    });

  } catch (err) {
    console.error("💥 ERROR:", err);
    return res.status(500).json({ error: "Server error!" });
  }
});

app.get("/api/admin/withdraw-requests", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("withdraw_request")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ withdraws: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/withdraw-status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    let { data, error } = await supabase
      .from("withdraw_request")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (!data && (!error || error.code === 'PGRST116')) {
      ({ data, error } = await supabase
        .from("withdraw_request")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("withdraw_id", id)
        .select()
        .maybeSingle());
    }

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/withdraw/:id", async (req, res) => {
  try {
    const { id } = req.params;

    let { error } = await supabase
      .from("withdraw_request")
      .delete()
      .eq("id", id);

    if (error && error.code === 'PGRST116') {
      ({ error } = await supabase
        .from("withdraw_request")
        .delete()
        .eq("withdraw_id", id));
    }

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ============================= HEALTH CHECK ============================ */
app.get("/health", (req, res) => {
  res.json({
    status: "✅ WALLET SERVER 5003 LIVE - NO RELATIONSHIP ERRORS",
    timestamp: new Date().toISOString(),
    endpoints: [
      "GET /api/admin/all-banks ✅ FIXED",
      "GET /api/admin/user-banks/:userId ✅ NEW", 
      "GET /api/bank-details/:profileId",
      "PUT /api/admin/verify-bank/:profileId",
      "PUT /api/admin/reject-bank/:profileId"
    ]
  });
});

app.use("*", (req, res) => {
  res.status(404).json({ error: "Endpoint not found!" });
});

app.listen(PORT, () => {
  console.log(`\n🚀 WALLET SERVER 5003 LIVE! http://localhost:${PORT}`);
  console.log(`✅ http://localhost:${PORT}/health`);
  console.log(`🏦 http://localhost:${PORT}/api/admin/all-banks`);
  console.log(`👤 http://localhost:${PORT}/api/admin/user-banks/:userId`);
  console.log(`\n🎮 BGMI WALLET SYSTEM 100% READY! 🔥\n`);
});

export default app;
