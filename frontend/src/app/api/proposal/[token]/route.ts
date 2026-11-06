import { NextResponse } from "next/server";
import { getProposalByToken, signProposal, declineProposal } from "@/lib/server/proposalService";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const proposal = await getProposalByToken(token);
    return NextResponse.json({ proposal });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Invalid or expired proposal link" },
      { status: 404 }
    );
  }
}

// POST /api/proposal/[token] -> Sign Proposal (Client action)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const body = await request.json();
    const { signerName, signerEmail, signatureData } = body;

    if (!signerName || !signerEmail || !signatureData) {
      return NextResponse.json(
        { error: "Signer name, email, and signature are required to execute agreement." },
        { status: 400 }
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";

    const result = await signProposal({
      rawToken: token,
      signerName,
      signerEmail,
      signatureData,
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: "Proposal signed successfully",
      ...result,
    });
  } catch (err: any) {
    console.error("Sign proposal error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to sign proposal" },
      { status: 400 }
    );
  }
}

// PATCH /api/proposal/[token] -> Decline Proposal (Client action)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const body = await request.json();
    const { reason } = body;

    const result = await declineProposal(token, reason);
    return NextResponse.json({
      success: true,
      message: "Proposal declined",
      proposal: result,
    });
  } catch (err: any) {
    console.error("Decline proposal error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to decline proposal" },
      { status: 400 }
    );
  }
}

