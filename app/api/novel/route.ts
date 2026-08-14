import { NextRequest } from "next/server";
import { handleCapabilityGeneration } from "@/lib/capabilities/generate";
export const POST = (req: NextRequest) => handleCapabilityGeneration(req, "novel");
