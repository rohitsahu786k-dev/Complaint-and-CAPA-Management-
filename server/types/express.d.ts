import type { ApiUser } from "@shared/types/api";

declare global {
  namespace Express {
    type UserContext = ApiUser;

    interface Request {
      user?: ApiUser;
      requestId?: string;
    }
  }
}

export {};
