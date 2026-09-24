// The seam between the outbox and a real delivery provider (email, SMS, messengers). No real
// provider is wired yet; the test provider records what it was asked to send.
import "server-only";
import type { MessageChannel } from "@/domain/message";

export interface OutboundMessage {
  /** Logical message id; providers that support idempotency receive it as their key. */
  readonly outboxId: string;
  readonly idempotencyKey: string;
  readonly channel: MessageChannel;
  readonly recipient: string;
  readonly template: string;
  readonly params: Record<string, unknown>;
  readonly secretParams: Record<string, unknown> | null;
}

/**
 * What the provider said. Acceptance is not delivery (§07.5). `retryable` means the provider
 * definitely did not take the message and it may be tried again.
 */
export type ProviderResult =
  | { readonly status: "accepted"; readonly providerMessageId: string }
  | { readonly status: "rejected"; readonly code: string; readonly retryable: boolean };

export interface MessageProvider {
  readonly name: string;
  /**
   * Hands one message to the provider. Throwing (timeout, dropped connection) means the
   * outcome is unknown and the message must be reconciled, never blindly re-sent.
   */
  send(message: OutboundMessage): Promise<ProviderResult>;
}

type Scripted = ProviderResult | "throw";

/** In-memory provider for tests and local development. Accepts everything unless scripted. */
export class TestMessageProvider implements MessageProvider {
  readonly name = "test";
  readonly sent: OutboundMessage[] = [];
  #script: Scripted[] = [];
  #counter = 0;

  /** Queues the results of the next `send` calls, in order. */
  script(...results: Scripted[]): void {
    this.#script.push(...results);
  }

  async send(message: OutboundMessage): Promise<ProviderResult> {
    this.sent.push(message);
    const next = this.#script.shift();
    if (next === "throw") throw new Error("Simulated provider timeout.");
    this.#counter += 1;
    return next ?? { status: "accepted", providerMessageId: `test-${this.#counter}` };
  }
}
