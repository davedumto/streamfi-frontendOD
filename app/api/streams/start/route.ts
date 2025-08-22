import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getStreamHealth, createLivepeerStream } from "@/lib/livepeer/server";

export async function POST(req: Request) {
  try {
    const { wallet } = await req.json();

    if (!wallet) {
      return NextResponse.json(
        {
          error: "Wallet is required",
          message: "Please connect your wallet to start streaming",
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

    let userResult = await sql`
      SELECT id, username, livepeer_stream_id, is_live, playback_id, streamkey
      FROM users 
      WHERE LOWER(wallet) = LOWER(${wallet})
    `;

    let user;

    if (userResult.rows.length === 0) {
      // Create a new user with the wallet address if they don't exist
      console.log("👤 Creating new user for wallet:", wallet);

      try {
        const newUserResult = await sql`
          INSERT INTO users (wallet, username, email, creator)
          VALUES (
            ${wallet}, 
            ${`user_${wallet.slice(2, 8)}`}, 
            ${`${wallet.slice(2, 8)}@example.com`},
            ${JSON.stringify({
              streamTitle: "My Live Stream",
              tags: [],
              category: "General",
              payout: "",
              thumbnail: "",
            })}
          )
          RETURNING id, username, livepeer_stream_id, is_live, playback_id, streamkey
        `;

        user = newUserResult.rows[0];
        console.log("✅ New user created:", user.username);
      } catch (createUserError) {
        console.error("Failed to create user:", createUserError);
        return NextResponse.json(
          { error: "Failed to create user account" },
          { status: 500 }
        );
      }
    } else {
      user = userResult.rows[0];
    }

    // If user doesn't have a stream key yet, create one (Twitch-style)
    if (!user.livepeer_stream_id) {
      console.log("🔑 Creating stream key for user:", user.username);

      try {
        const livepeerStream = await createLivepeerStream({
          name: `${user.username} - Live Stream`,
          record: true,
        });

        if (
          !livepeerStream ||
          !livepeerStream.id ||
          !livepeerStream.playbackId ||
          !livepeerStream.streamKey
        ) {
          return NextResponse.json(
            { error: "Failed to create stream key" },
            { status: 500 }
          );
        }

        // Update user with stream key
        await sql`
          UPDATE users SET
            livepeer_stream_id = ${livepeerStream.id},
            playback_id = ${livepeerStream.playbackId},
            streamkey = ${livepeerStream.streamKey},
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${user.id}
        `;

        return NextResponse.json(
          {
            message:
              "Stream key created successfully! Copy the stream key to OBS Studio.",
            streamKey: livepeerStream.streamKey,
            playbackId: livepeerStream.playbackId,
            streamId: livepeerStream.id,
            isLive: false,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Failed to create stream key:", error);
        return NextResponse.json(
          { error: "Failed to create stream key" },
          { status: 500 }
        );
      }
    }

    // User has stream key, check if OBS Studio has connected
    if (user.is_live) {
      return NextResponse.json(
        {
          message: "Stream is already live",
          isLive: true,
          streamId: user.livepeer_stream_id,
          playbackId: user.playback_id,
          streamKey: user.streamkey,
        },
        { status: 200 }
      );
    }

    // Check if OBS Studio has connected to the stream
    try {
      const streamHealth = await getStreamHealth(user.livepeer_stream_id);

      if (streamHealth.isActive) {
        console.log(
          "🎬 OBS Studio detected! Auto-starting stream for:",
          user.username
        );

        // Update user to mark stream as live
        const updateResult = await sql`
          UPDATE users SET
            is_live = true,
            stream_started_at = CURRENT_TIMESTAMP,
            current_viewers = 0,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${user.id}
          RETURNING id, username, livepeer_stream_id, playback_id, streamkey
        `;

        const updatedUser = updateResult.rows[0];

        // Create stream session record
        try {
          await sql`
            INSERT INTO stream_sessions (user_id, livepeer_session_id, started_at)
            VALUES (${updatedUser.id}, ${updatedUser.livepeer_stream_id}, CURRENT_TIMESTAMP)
          `;
        } catch (sessionError) {
          console.error(
            "Failed to create stream session record:",
            sessionError
          );
        }

        return NextResponse.json(
          {
            message:
              "Stream auto-started successfully! OBS Studio connection detected.",
            isLive: true,
            streamId: updatedUser.livepeer_stream_id,
            playbackId: updatedUser.playback_id,
            streamKey: updatedUser.streamkey,
            username: updatedUser.username,
            startedAt: new Date().toISOString(),
            autoStarted: true,
          },
          { status: 200 }
        );
      } else {
        // Stream is not active yet (OBS Studio hasn't connected)
        return NextResponse.json(
          {
            message:
              "Stream not active yet. Please start streaming in OBS Studio.",
            isLive: false,
            streamId: user.livepeer_stream_id,
            playbackId: user.playback_id,
            streamKey: user.streamkey,
            waitingForOBS: true,
          },
          { status: 200 }
        );
      }
    } catch (healthError) {
      console.error("Stream health check failed:", healthError);
      return NextResponse.json(
        { error: "Failed to check stream status" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Stream start error:", error);
    return NextResponse.json(
      { error: "Failed to start stream" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { wallet } = await req.json();

    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet is required" },
        { status: 400 }
      );
    }

    const userResult = await sql`
      SELECT id, livepeer_stream_id, is_live 
      FROM users 
      WHERE wallet = ${wallet}
    `;

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = userResult.rows[0];

    if (!user.is_live) {
      return NextResponse.json(
        { error: "Stream is not currently live" },
        { status: 409 }
      );
    }

    await sql`
      UPDATE users SET
        is_live = false,
        stream_started_at = NULL,
        current_viewers = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${user.id}
    `;

    try {
      await sql`
        UPDATE stream_sessions SET
          ended_at = CURRENT_TIMESTAMP
        WHERE user_id = ${user.id} AND ended_at IS NULL
      `;
    } catch (sessionError) {
      console.error("Failed to end stream session:", sessionError);
    }

    return NextResponse.json(
      { message: "Stream stopped successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Stream stop error:", error);
    return NextResponse.json(
      { error: "Failed to stop stream" },
      { status: 500 }
    );
  }
}
