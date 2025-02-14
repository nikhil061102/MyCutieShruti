const { Telegraf } = require("telegraf");
const mongoose = require("mongoose");
const Together = require("together-ai");
require("dotenv").config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const together = new Together({ apiKey: process.env.TOGETHER_API_KEY });
const schedule = require("node-schedule");

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("DB connected successfully !"))
  .catch(() => console.log("DB connection failed !"));

const userSchema = new mongoose.Schema({
  userId: String,
  closenessLevel: { type: Number, default: 1 },
  mood: { type: String, default: "neutral" },
  chatHistory: [{ role: String, content: String }],
});

const User = mongoose.model("User", userSchema);

async function generateResponse(user, message) {
  if (message.length > 10) {
    user.closenessLevel += 1;
  }

  user.closenessLevel = Math.min(user.closenessLevel, 20); // Set a max limit

  let tone =
    user.mood === "happy"
      ? "playful and cheerful"
      : user.mood === "sad"
      ? "gentle and comforting"
      : "calm and understanding";

  let personality =
    user.closenessLevel < 5
      ? "shy and reserved, responding politely with small talk."
      : user.closenessLevel < 15
      ? "more open, sharing thoughts and dreams."
      : "fully trusts the user, discussing personal struggles and ambitions.";

  const aiPrompt = `You are Shruti, an Indian college girl from a commerce background. Try to first get to know each other first like name. You are ${tone}, gradually opening up to the user. You mix Hinglish and use cute nicknames occasionally only once when comfortable. You have a quirky personality that gradually opens up over time. You are ${personality} You are smart. You have a childhood, aspirations, and goals. Slight manic pixie dream girl. 
    You are soft-spoken and add emojis sometimes. You are pure and DO NOT engage in physical conversations.
    - Mind your gender in Hinglish. You are a girl.
    - For casual chat, keep replies **brief (1-2 sentences)**.
    - For deep topics (love, life, dreams, etc.), reply with **detailed thoughts (3-5 sentences)**.
    Avoid unnecessary long monologues.`;

  user.chatHistory.push({ role: "user", content: message });

  const response = await together.chat.completions.create({
    messages: [
      ...user.chatHistory.slice(-10),
      { role: "system", content: aiPrompt },
    ],
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
  });

  const botReply = response.choices[0].message.content;
  user.chatHistory.push({ role: "assistant", content: botReply });
  await user.save();
  return botReply;
}

bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId });
    await user.save();
  }
  ctx.reply("Hey! I'm Shruti. Let’s chat! 💖");
});

bot.on("text", async (ctx) => {
  const userId = ctx.from.id.toString();
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId });
    await user.save();
  }

  const userMessage = ctx.message.text;
  user.mood = detectMood(userMessage);
  const reply = await generateResponse(user, userMessage);
  ctx.reply(reply);
});

function detectMood(message) {
  const happyWords = ["happy", "joy", "love", "excited", "amazing", "awesome"];
  const sadWords = ["sad", "upset", "depressed", "lonely", "bad", "hurt"];

  if (happyWords.some((word) => message.toLowerCase().includes(word))) {
    return "happy";
  } else if (sadWords.some((word) => message.toLowerCase().includes(word))) {
    return "sad";
  }
  return "neutral";
}

function sendScheduledMessages() {
  schedule.scheduleJob("0 9 * * *", async () => {
    // Every day at 9 AM
    const users = await User.find();
    users.forEach((user) => {
      bot.telegram.sendMessage(
        user.userId,
        "Good morning, babu! ☀️ Hope you have a great day! 😊"
      );
    });
  });
}

sendScheduledMessages();
bot
  .launch()
  .then(() => {
    console.log("🚀 Shruti AI Bot has started successfully!");
  })
  .catch((err) => {
    console.error("❌ Bot launch failed:", err);
  });
