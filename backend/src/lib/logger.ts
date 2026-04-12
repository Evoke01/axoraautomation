import type { FastifyServerOptions } from "fastify";

import { env } from "../config/env.js";

export const loggerOptions: FastifyServerOptions["logger"] =
  env.NODE_ENV === "production"
    ? true
    : {
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "SYS:standard",
            ignore: "pid,hostname"
          }
        }
      };
