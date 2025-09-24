// api/companion.js
import { Sequelize, DataTypes } from "sequelize";
import OpenAI from "openai";

// 初始化数据库连接（保证复用，避免每次新建连接）
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    logging: false,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false }, // Aiven 必须开 SSL
    },
  }
);

// 定义模型（等价于 models/CompanionMessage.js）
const CompanionMessage = sequelize.define(
  "CompanionMessage",
  {
    sessionId: { type: DataTypes.STRING, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    role: { type: DataTypes.ENUM("user", "assistant"), allowNull: false },
    content: { type: DataTypes.TEXT("long"), allowNull: false },
    mood: { type: DataTypes.STRING, allowNull: true },
  },
  {
    tableName: "CompanionMessages",
    freezeTableName: true,
    timestamps: true,
  }
);

const openai = new OpenAI({ apiKey: process.env.API_KEY });

export default async function handler(req, res) {
  if (req.method === "POST") {
    // 🔹 处理聊天请求
    try {
      const { sessionId, messages } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required." });
      }

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Empty or invalid messages." });
      }

      // 📝 最后一条用户消息
      const lastUserPrompt = messages
        .filter((m) => m.role === "user" && m.content?.trim())
        .map((m) => m.content.trim())
        .pop();

      // 📌 保存用户消息
      if (lastUserPrompt) {
        await CompanionMessage.create({
          sessionId,
          userId: null,
          role: "user",
          content: lastUserPrompt,
          mood: null,
        });
      }

      // 🎯 GPT 回复
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `
You are a warm, empathetic AI assistant embedded in a public-interest platform that helps people affected by online harm.
Tone: Always caring, calm, and emotionally supportive.`,
          },
          ...messages,
        ],
      });

      const reply = completion.choices[0].message.content;

      // 🎯 情绪检测
      let mood = "neutral";
      try {
        const moodCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Classify reply as: "neutral", "happy", "sad", "caring".`,
            },
            { role: "user", content: reply },
          ],
        });
        mood = moodCompletion.choices[0].message.content.trim().toLowerCase();
      } catch (e) {
        console.warn("⚠️ Mood detection failed:", e);
      }

      // ✍️ 保存 AI 回复
      if (reply) {
        await CompanionMessage.create({
          sessionId,
          userId: null,
          role: "assistant",
          content: reply,
          mood,
        });
      }

      return res.status(200).json({ reply, mood });
    } catch (error) {
      console.error("Chat API error:", error);
      return res.status(500).json({ error: "Something went wrong." });
    }
  }

  if (req.method === "GET") {
    // 🔹 获取某个 session 的完整对话
    try {
      const { sessionId } = req.query;

      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required." });
      }

      const messages = await CompanionMessage.findAll({
        where: { sessionId },
        order: [["createdAt", "ASC"]],
      });

      return res.status(200).json(messages);
    } catch (err) {
      console.error("Fetch session error:", err);
      return res
        .status(500)
        .json({ error: "Failed to fetch session messages" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
