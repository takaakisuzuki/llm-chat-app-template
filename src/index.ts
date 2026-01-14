/**
 * LLM Chat Application Template
 * 
 * Modified for Gemma 3 compatibility
 */
import { Env, ChatMessage } from "./types";

const MODEL_ID = "@cf/google/gemma-3-12b-it";

const SYSTEM_PROMPT =
	"You are a helpful, friendly assistant. Provide concise and accurate responses.";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		if (url.pathname === "/api/chat" && request.method === "POST") {
			return handleChatRequest(request, env);
		}

		return new Response("Not Found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

async function handleChatRequest(request: Request, env: Env): Promise<Response> {
	const body = await request.json() as { messages: ChatMessage[] };
	
	// Gemma 3 用にメッセージを整形
	const formattedMessages = formatMessagesForGemma(body.messages);

	const stream = await env.AI.run(MODEL_ID, {
		messages: formattedMessages,
		stream: true,
	});

	return new Response(stream, {
		headers: { "content-type": "text/event-stream" },
	});
}

/**
 * Gemma 3 はロールの交互配置が必須
 * system ロールは最初の user メッセージに統合する
 */
function formatMessagesForGemma(messages: ChatMessage[]): ChatMessage[] {
	const result: ChatMessage[] = [];
	
	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i];
		
		// system メッセージはスキップ（後で user に統合）
		if (msg.role === "system") {
			continue;
		}
		
		// 最初の user メッセージに system prompt を追加
		if (msg.role === "user" && result.length === 0) {
			result.push({
				role: "user",
				content: `${SYSTEM_PROMPT}\n\n${msg.content}`,
			});
		}
		// 同じロールが連続する場合は統合
		else if (result.length > 0 && result[result.length - 1].role === msg.role) {
			result[result.length - 1].content += "\n" + msg.content;
		}
		// 通常のケース
		else {
			result.push({
				role: msg.role,
				content: msg.content,
			});
		}
	}
	
	// 最初のメッセージが user でない場合の対処
	if (result.length > 0 && result[0].role !== "user") {
		result.unshift({
			role: "user",
			content: SYSTEM_PROMPT,
		});
	}
	
	// 空の場合のフォールバック
	if (result.length === 0) {
		result.push({
			role: "user",
			content: SYSTEM_PROMPT,
		});
	}
	
	return result;
}
