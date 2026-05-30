import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

test("syncCoreData can pull ERP organization users into the shared local database", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-org-users-"));
  process.env.PMC_DB_PATH = path.join(tempDir, "pmc.db");
  const { listOrgUsers, upsertOrgUsers } = await import("../src/localDb.js");
  const { syncCoreData } = await import("../src/syncService.js");
  const receivedPages = [];
  upsertOrgUsers([
    { user_id: "stale", username: "stale", display_name: "已删除员工", employee_status: "正常", department_name: "旧部门", raw: {}, synced_at: "2026-05-28T00:00:00.000Z" }
  ]);

  const client = {
    async queryView(viewName, params) {
      assert.equal(viewName, "org_users");
      receivedPages.push(params.page_index);
      const rowsByPage = new Map([
        [1, [
          ["U-1", "wangsh", "E001", "王少花", "正常", "16", "供销部"],
          ["U-2", "gez", "E002", "葛梓", "冻结", "34", "财务部"]
        ]],
        [2, [
          ["U-3", "zhangsan", "E003", "张三", "正常", "35", "生产部"]
        ]]
      ]);
      return {
        Cols: ["账号ID", "账号名称", "员工编号", "员工姓名", "员工状态", "部门id", "部门名称"],
        Rows: rowsByPage.get(Number(params.page_index)) || [],
        Page: { PageIndex: params.page_index, PageSize: 2, PageCount: 2, RecordCount: 3 }
      };
    }
  };

  const result = await syncCoreData(client, { sources: "org_users", pagesize: 2, force_sync: "1" });

  assert.equal(result.results[0].status, "success");
  assert.equal(result.results[0].rows_synced, 3);
  assert.deepEqual(receivedPages, [1, 2]);
  assert.deepEqual(listOrgUsers({ limit: 10 }).map((row) => row.display_name), ["王少花", "张三"]);
  assert.deepEqual(listOrgUsers({ limit: 10, activeOnly: false }).map((row) => row.display_name), ["王少花", "葛梓", "张三"]);
});
