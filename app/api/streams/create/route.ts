import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { createLivepeerStream } from "@/lib/livepeer/server";
import { checkExistingTableDetail } from "@/utils/validators";

export async function POST(req: Request) {
  try {
    const { wallet, title, description, category, tags } = await req.json();

    console.log("🔍 Stream creation request:", {
      wallet,
      title,
      description,
      category,
      tags,
      timestamp: new Date().toISOString(),
    });

    if (!wallet || !title) {
      console.log("❌ Validation failed: missing wallet or title");
      return NextResponse.json(
        {
          error: "Wallet and title are required",
          message: "Please connect your wallet and provide a stream title",
        },
        { status: 400 }
      );
    }

    // Validate wallet address format
    if (!wallet.startsWith("0x") || wallet.length < 10) {
      return NextResponse.json(
        {
          error: "Invalid wallet address format",
          message: "Please provide a valid wallet address",
        },
        { status: 400 }
      );
    }

    if (title.length > 100) {
      console.log("❌ Validation failed: title too long");
      return NextResponse.json(
        { error: "Title must be 100 characters or less" },
        { status: 400 }
      );
    }

    if (description && description.length > 500) {
      console.log("❌ Validation failed: description too long");
      return NextResponse.json(
        { error: "Description must be 500 characters or less" },
        { status: 400 }
      );
    }

    console.log("🔍 Checking if user exists...");
    const userExists = await checkExistingTableDetail(
      "users",
      "wallet",
      wallet
    );
    if (!userExists) {
      console.log("❌ User not found:", wallet);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.log("✅ User found:", wallet);

    console.log("🔍 Fetching user data...");
    const userResult = await sql`
      SELECT id, username, creator, livepeer_stream_id FROM users WHERE LOWER(wallet) = LOWER(${wallet})
    `;

    if (userResult.rows.length === 0) {
      console.log("❌ User not found in database query");
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = userResult.rows[0];
    console.log("📊 User data:", {
      id: user.id,
      username: user.username,
      hasStream: !!user.livepeer_stream_id,
      existingStreamId: user.livepeer_stream_id,
    });

    if (user.livepeer_stream_id) {
      console.log("❌ User already has stream:", user.livepeer_stream_id);
      return NextResponse.json(
        {
          error:
            "User already has an active stream. Please delete the existing stream first.",
        },
        { status: 409 }
      );
    }

    if (!process.env.LIVEPEER_API_KEY) {
      console.log("❌ Missing LIVEPEER_API_KEY environment variable");
      return NextResponse.json(
        { error: "Livepeer API key not configured" },
        { status: 500 }
      );
    }
    console.log(
      "✅ Livepeer API key found, length:",
      process.env.LIVEPEER_API_KEY.length
    );

    console.log("🎬 Creating Livepeer stream...");
    let livepeerStream;
    try {
      livepeerStream = await createLivepeerStream({
        name: `${user.username} - ${title}`,
        record: true,
      });
      console.log("✅ Livepeer stream created successfully:", {
        id: livepeerStream?.id,
        playbackId: livepeerStream?.playbackId,
        hasStreamKey: !!livepeerStream?.streamKey,
      });
    } catch (livepeerError) {
      console.error("❌ Livepeer stream creation failed:", livepeerError);

      if (livepeerError instanceof Error) {
        console.error("Livepeer error details:", {
          message: livepeerError.message,
          stack: livepeerError.stack,
          name: livepeerError.name,
        });
      }

      return NextResponse.json(
        {
          error: "Failed to create Livepeer stream",
          details:
            livepeerError instanceof Error
              ? livepeerError.message
              : "Unknown Livepeer error",
        },
        { status: 500 }
      );
    }

    if (
      !livepeerStream ||
      !livepeerStream.id ||
      !livepeerStream.playbackId ||
      !livepeerStream.streamKey
    ) {
      console.log("❌ Invalid Livepeer response:", livepeerStream);
      return NextResponse.json(
        { error: "Failed to create Livepeer stream - incomplete response" },
        { status: 500 }
      );
    }

    console.log("🔍 Updating user with Livepeer data...");
    const updatedCreator = {
      ...user.creator,
      streamTitle: title,
      description: description || "",
      category: category || "",
      tags: tags || [],
      lastUpdated: new Date().toISOString(),
    };

    try {
      await sql`
        UPDATE users SET
          livepeer_stream_id = ${livepeerStream.id},
          playback_id = ${livepeerStream.playbackId},
          streamkey = ${livepeerStream.streamKey},
          creator = ${JSON.stringify(updatedCreator)},
          updated_at = CURRENT_TIMESTAMP
        WHERE LOWER(wallet) = LOWER(${wallet})
      `;
      console.log("✅ User updated successfully with stream data");
    } catch (dbError) {
      console.error("❌ Database update failed:", dbError);

      console.log("🧹 Attempting to cleanup Livepeer stream...");
      try {
        console.log("Stream cleanup would go here");
      } catch (cleanupError) {
        console.error("❌ Cleanup failed:", cleanupError);
      }

      return NextResponse.json(
        {
          error: "Failed to save stream data to database",
          details:
            dbError instanceof Error ? dbError.message : "Database error",
        },
        { status: 500 }
      );
    }

    console.log("🎉 Stream creation completed successfully!");

    return NextResponse.json(
      {
        message:
          "Stream created successfully! You can now start streaming in OBS Studio and the stream will automatically go live.",
        streamData: {
          streamId: livepeerStream.id,
          playbackId: livepeerStream.playbackId,
          streamKey: livepeerStream.streamKey,
          title: title,
          isActive: livepeerStream.isActive || false,
          autoStartEnabled: true,
        },
        instructions: {
          step1: "Copy the stream key above",
          step2: "Paste it into OBS Studio streaming settings",
          step3: "Click 'Start Streaming' in OBS Studio",
          step4: "The stream will automatically go live in the app!",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("❌ Stream creation error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : "";

    console.log("Error details:", {
      message: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString(),
    });

    if (error instanceof Error) {
      if (error.message.includes("Livepeer")) {
        return NextResponse.json(
          { error: "Streaming service unavailable. Please try again later." },
          { status: 503 }
        );
      }

      if (error.message.includes("database") || error.message.includes("sql")) {
        return NextResponse.json(
          { error: "Database error. Please try again later." },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to create stream",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
