import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { chmod, mkdir, open, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// 进程传入的环境变量优先于 .env.local，容器中的数据库路径不会被本地配置覆盖。
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const args = process.argv.slice(2);

if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
  console.log("用法：npm run db:backup -- [目标文件]\n默认：backups/nav-palace-时间戳.db\n使用 SQLite 在线备份 API；不会覆盖已有文件。");
} else {
  let database;
  let reservedDestination;
  try {
    if (args.length > 1 || args[0]?.startsWith("-")) {
      throw new Error("参数无效，请使用 npm run db:backup -- [目标文件]");
    }
    const source = resolve(process.env.DATABASE_PATH || "./data/nav-palace.db");
    if (!existsSync(source)) throw new Error("数据库文件不存在，请先启动应用完成初始化");
    const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const destination = resolve(args[0] || `backups/nav-palace-${timestamp}.db`);
    if (source === destination) throw new Error("备份目标不能与当前数据库相同");

    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    // 独占创建目标文件，防止路径写错时覆盖已有备份。
    const reservation = await open(destination, "wx", 0o600);
    await reservation.close();
    reservedDestination = destination;

    // 使用 SQLite 在线备份 API，应用运行时也能一致地备份 WAL 中的数据。
    // 此处只备份数据库，上传图片需另行复制同级 uploads 目录。
    database = new Database(source, { readonly: true, fileMustExist: true });
    await database.backup(destination);
    await chmod(destination, 0o600);
    reservedDestination = undefined;
    console.log(`数据库已备份：${destination}`);
  } catch (error) {
    // 仅删除本次预留但未完成的文件，保留已有备份。
    if (reservedDestination) await unlink(reservedDestination).catch(() => {});
    const message = error && typeof error === "object" && "code" in error && error.code === "EEXIST"
      ? "目标文件已存在，请使用新的文件名；已有文件未被覆盖"
      : error instanceof Error ? error.message : "未知错误";
    console.error(`备份失败：${message}`);
    process.exitCode = 1;
  } finally {
    database?.close();
  }
}
