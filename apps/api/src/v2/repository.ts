import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync
} from "node:fs";
import {
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import {
  industrialProjectSchema,
  marketplaceNeedProfileSchema,
  paymentEvidenceSchema,
  solutionDecisionSchema,
  solutionResearchResultSchema,
  supplierClaimSchema,
  supplierCommercialResponseSchema,
  supplierInvitationSchema,
  supplierLeadSchema,
  supplierOutreachDeliverySchema,
  supplierProfileSchema
} from "@veltact/contracts";
import { z } from "zod";

export const v2NeedRecordSchema = z.object({
  id: z.string().min(1),
  buyerEmail: z.string().email(),
  buyerName: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  buyerAccessTokenHash: z.string().length(64),
  profile: marketplaceNeedProfileSchema,
  selectedSupplierResponseId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type V2NeedRecord = z.infer<typeof v2NeedRecordSchema>;

export const veltactV2SnapshotSchema = z.object({
  schemaVersion: z.literal(2),
  revision: z.number().int().nonnegative(),
  needs: z.array(v2NeedRecordSchema),
  researchResults: z.array(solutionResearchResultSchema),
  solutionDecisions: z.array(solutionDecisionSchema),
  supplierLeads: z.array(supplierLeadSchema),
  supplierInvitations: z.array(supplierInvitationSchema),
  outreachDeliveries: z.array(supplierOutreachDeliverySchema),
  supplierClaims: z.array(supplierClaimSchema),
  supplierProfiles: z.array(supplierProfileSchema),
  supplierResponses: z.array(supplierCommercialResponseSchema),
  projects: z.array(industrialProjectSchema),
  paymentEvidence: z.array(paymentEvidenceSchema),
  lastResetAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime()
});
export type VeltactV2Snapshot = z.infer<typeof veltactV2SnapshotSchema>;

export class V2RepositoryError extends Error {
  constructor(message: string, readonly causeDetail?: unknown) {
    super(message);
    this.name = "V2RepositoryError";
  }
}

export class AtomicV2Repository {
  private state: VeltactV2Snapshot;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string | undefined) {
    this.state = loadSnapshot(filePath);
  }

  snapshot() {
    return structuredClone(this.state);
  }

  async mutate<T>(mutation: (draft: VeltactV2Snapshot) => T): Promise<T> {
    let resolveResult: (value: T | PromiseLike<T>) => void = () => undefined;
    let rejectResult: (reason?: unknown) => void = () => undefined;
    const result = new Promise<T>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    this.writeQueue = this.writeQueue
      .then(async () => {
        const draft = structuredClone(this.state);
        const mutationResult = mutation(draft);
        draft.revision = this.state.revision + 1;
        draft.updatedAt = new Date().toISOString();
        const validated = veltactV2SnapshotSchema.parse(draft);
        await persistSnapshot(this.filePath, validated);
        this.state = validated;
        resolveResult(structuredClone(mutationResult));
      })
      .catch((error: unknown) => {
        rejectResult(error);
      });

    return result;
  }

  async reset(nextState = createEmptyV2Snapshot()) {
    await this.mutate((draft) => {
      const replacement = structuredClone(nextState);
      replacement.revision = draft.revision;
      Object.assign(draft, replacement);
    });
    return this.snapshot();
  }

  async flush() {
    await this.writeQueue;
  }
}

export function createEmptyV2Snapshot(currentTime = new Date()): VeltactV2Snapshot {
  return {
    schemaVersion: 2,
    revision: 0,
    needs: [],
    researchResults: [],
    solutionDecisions: [],
    supplierLeads: [],
    supplierInvitations: [],
    outreachDeliveries: [],
    supplierClaims: [],
    supplierProfiles: [],
    supplierResponses: [],
    projects: [],
    paymentEvidence: [],
    updatedAt: currentTime.toISOString()
  };
}

function loadSnapshot(filePath: string | undefined): VeltactV2Snapshot {
  if (!filePath || !existsSync(filePath)) {
    return createEmptyV2Snapshot();
  }

  try {
    return veltactV2SnapshotSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
  } catch (error) {
    throw new V2RepositoryError(
      `Veltact V2 data is corrupt or incompatible: ${filePath}. ` +
        "Move the file aside or run the explicit demo reset before restarting.",
      error
    );
  }
}

async function persistSnapshot(
  filePath: string | undefined,
  snapshot: VeltactV2Snapshot
) {
  if (!filePath) {
    return;
  }

  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
