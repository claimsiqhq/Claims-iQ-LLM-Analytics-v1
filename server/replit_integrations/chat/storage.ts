export interface IChatStorage {
  getConversation(id: number): Promise<any>;
  getAllConversations(): Promise<any[]>;
  createConversation(title: string): Promise<any>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<any[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<any>;
}

export const chatStorage: IChatStorage = {
  async getConversation(_id: number) {
    throw new Error("Chat storage not configured");
  },
  async getAllConversations() {
    throw new Error("Chat storage not configured");
  },
  async createConversation(_title: string) {
    throw new Error("Chat storage not configured");
  },
  async deleteConversation(_id: number) {
    throw new Error("Chat storage not configured");
  },
  async getMessagesByConversation(_conversationId: number) {
    throw new Error("Chat storage not configured");
  },
  async createMessage(_conversationId: number, _role: string, _content: string) {
    throw new Error("Chat storage not configured");
  },
};
