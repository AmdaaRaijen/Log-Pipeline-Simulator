import { NextResponse } from "next/server";
import getDb from "../../../../lib/directive/db";

export async function GET() {
  try {
    const db = await getDb();
    const result = await db.execute("SELECT * FROM plugins ORDER BY siem_plugin_type ASC");
    return NextResponse.json(result.rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filter, plugin_id, by, siem_plugin_type } = body;
    
    if (!plugin_id || !siem_plugin_type) {
      return NextResponse.json({ error: "plugin_id and siem_plugin_type are required" }, { status: 400 });
    }

    const db = await getDb();
    const result = await db.execute({
      sql: `INSERT INTO plugins (filter, plugin_id, "by", siem_plugin_type) VALUES (?, ?, ?, ?)`,
      args: [filter || "", Number(plugin_id), by || "", siem_plugin_type]
    });

    return NextResponse.json({ success: true, id: result.lastInsertRowid?.toString() });
  } catch (error: any) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return NextResponse.json({ error: "Plugin ID already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
