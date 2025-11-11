import "dotenv-flow/config";
import { ConversationManager } from "../src/services/conversation_manager";

async function runDemo() {
  const manager = new ConversationManager();

  await manager.ingestUserMessage("Hi, I want to book a cleaning next week");
  console.log("Assistant:", await manager.generateAssistantReply());

  await manager.ingestUserMessage("My name is Layla, phone is 0501234567");
  console.log("Assistant:", await manager.generateAssistantReply());

  await manager.ingestUserMessage("Actually, make it Wednesday afternoon");
  console.log("Assistant:", await manager.generateAssistantReply());

  console.log("Current state:", manager.getState());
}

runDemo().catch((err) => {
  console.error(err);
  process.exit(1);
});
