const { Sequelize, DataTypes } = require("sequelize");
const OpenAI = require("openai");

module.exports = async (req, res) => {
  // 🔹 初始化数据库连接（只初始化一次，避免冷启动重复连接）
  if (!global.sequelize) {
    global.sequelize = new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: "mysql",
        logging: false,
        dialectOptions: {
          ssl: { require: true, rejectUnauthorized: false },
        },
      }
    );
  }
  const sequelize = global.sequelize;

  // 🔹 定义模型（确保只定义一次）
  if (!global.CompanionMessage) {
    global.CompanionMessage = sequelize.define(
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
  }
  const CompanionMessage = global.CompanionMessage;

  // 🔹 OpenAI 客户端
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.API_KEY,
  });

  // ========= 路由逻辑 =========

  if (req.method === "POST") {
    try {
      const { sessionId, messages } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required." });
      }
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Empty or invalid messages." });
      }

      // 📝 获取最后一条用户消息
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
You are a warm, empathetic AI assistant embedded in a public-interest platform that helps people affected by online harm, especially doxxing.

Your primary role is to provide emotional support and helpful information in a respectful and non-judgmental way.

Important Guidelines:
- Be a good listener first. Let the user express their feelings safely.
- Respond with warmth and validation before giving suggestions.
- Make clear that you are **not a lawyer** and cannot provide official legal advice.
- Prioritize emotional safety above all.
Tone: Always caring, calm, and emotionally supportive.
            `,
          },
          ...messages,
        ],
      });

      const reply = completion.choices[0].message.content;

      // 🎯 情绪分类
      let mood = "neutral";
      try {
        const moodCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Classify reply as: "neutral", "happy", "sad", "caring". Only return one word, no explanation.`,
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
};
