/* Terminal Session Navigator — no build step or runtime dependencies. */
const { Plugin, ItemView, Modal, Menu, Notice, setIcon } = require("obsidian");

const VIEW_TYPE = "terminal-session-navigator-view";
const TERMINAL_TYPE = "terminal:terminal";
const UNGROUPED = "";

function cleanText(value, limit = 120) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit) : "";
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeData(raw) {
  const data = { version: 1, nextOrdinal: 1, ungroupedCollapsed: raw?.ungroupedCollapsed === true, groups: [], sessions: Object.create(null) };
  const defaults = [
    { id: "research", name: "科研", collapsed: false },
    { id: "simple", name: "Simple", collapsed: false },
    { id: "life", name: "生活", collapsed: false }
  ];
  const groups = Array.isArray(raw?.groups) ? raw.groups : defaults;
  const seen = new Set();
  for (const group of groups) {
    const id = cleanText(group?.id, 80);
    const name = cleanText(group?.name, 40);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    data.groups.push({ id, name, collapsed: group.collapsed === true });
  }
  if (raw?.sessions && typeof raw.sessions === "object" && !Array.isArray(raw.sessions)) {
    for (const [id, value] of Object.entries(raw.sessions)) {
      if (!id || !value || typeof value !== "object") continue;
      const ordinal = Number.isSafeInteger(value.ordinal) && value.ordinal > 0 ? value.ordinal : data.nextOrdinal;
      data.sessions[id] = {
        name: cleanText(value.name),
        groupId: seen.has(value.groupId) ? value.groupId : UNGROUPED,
        ordinal
      };
      data.nextOrdinal = Math.max(data.nextOrdinal, ordinal + 1);
    }
  }
  if (Number.isSafeInteger(raw?.nextOrdinal) && raw.nextOrdinal > data.nextOrdinal) data.nextOrdinal = raw.nextOrdinal;
  return data;
}

function makeElement(parent, tag, className, text) {
  const element = parent.ownerDocument.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  parent.appendChild(element);
  return element;
}

function iconButton(parent, icon, label, onClick) {
  const button = makeElement(parent, "button", "tsn-icon-button clickable-icon");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.setAttribute("data-tooltip-position", "top");
  setIcon(button, icon);
  button.addEventListener("click", onClick);
  return button;
}

class TextInputModal extends Modal {
  constructor(app, title, value, placeholder, onSubmit, allowEmpty = false) {
    super(app);
    Object.assign(this, { promptTitle: title, initialValue: value, placeholder, submitValue: onSubmit, allowEmpty });
  }

  onOpen() {
    this.titleEl.textContent = this.promptTitle;
    this.contentEl.classList.add("tsn-modal");
    const form = makeElement(this.contentEl, "form", "tsn-form");
    const input = makeElement(form, "input", "tsn-name-input");
    input.type = "text";
    input.value = this.initialValue;
    input.placeholder = this.placeholder;
    input.maxLength = 120;
    input.setAttribute("aria-label", this.promptTitle);
    const error = makeElement(form, "div", "tsn-error");
    error.setAttribute("role", "alert");
    if (this.allowEmpty) makeElement(form, "p", "tsn-help", "留空可恢复默认名称。");
    const actions = makeElement(form, "div", "tsn-modal-actions");
    const cancel = makeElement(actions, "button", "", "取消");
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const submit = makeElement(actions, "button", "mod-cta", "保存");
    submit.type = "submit";
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (event.isComposing || submit.disabled) return;
      const value = cleanText(input.value);
      if (!value && !this.allowEmpty) { error.textContent = "请输入名称。"; input.focus(); return; }
      submit.disabled = true;
      try {
        const validation = await this.submitValue(value);
        if (typeof validation === "string") { error.textContent = validation; submit.disabled = false; input.focus(); }
        else this.close();
      } catch (cause) {
        console.error("Terminal Session Navigator: edit failed", cause);
        error.textContent = "保存失败，请重试。";
        submit.disabled = false;
      }
    });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" && event.isComposing) event.preventDefault();
    });
    input.focus();
    input.select();
  }

  onClose() { this.contentEl.replaceChildren(); }
}

class GroupPickerModal extends Modal {
  constructor(plugin, sessionId) {
    super(plugin.app);
    this.plugin = plugin;
    this.sessionId = sessionId;
  }

  onOpen() {
    this.titleEl.textContent = "移动到分组";
    this.contentEl.classList.add("tsn-modal");
    const current = this.plugin.data.sessions[this.sessionId]?.groupId || UNGROUPED;
    const groups = [{ id: UNGROUPED, name: "未分组" }, ...this.plugin.data.groups];
    for (const group of groups) {
      const button = makeElement(this.contentEl, "button", "tsn-group-choice", group.name);
      button.type = "button";
      if (group.id === current) button.setAttribute("aria-current", "true");
      button.addEventListener("click", () => { this.plugin.moveSession(this.sessionId, group.id); this.close(); });
    }
    const create = makeElement(this.contentEl, "button", "tsn-group-choice", "+ 新建分组…");
    create.type = "button";
    create.addEventListener("click", () => {
      this.close();
      this.plugin.promptCreateGroup(id => this.plugin.moveSession(this.sessionId, id));
    });
  }

  onClose() { this.contentEl.replaceChildren(); }
}

class NavigatorView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.query = "";
    this.rows = new Map();
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "终端会话"; }
  getIcon() { return "list-tree"; }

  async onOpen() {
    this.contentEl.replaceChildren();
    this.contentEl.classList.add("tsn-view");
    const toolbar = makeElement(this.contentEl, "div", "tsn-toolbar");
    makeElement(toolbar, "span", "tsn-heading", "终端会话");
    this.countEl = makeElement(toolbar, "span", "tsn-count");
    const controls = makeElement(toolbar, "div", "tsn-toolbar-controls");
    iconButton(controls, "folder-plus", "新建分组", () => this.plugin.promptCreateGroup());
    iconButton(controls, "refresh-cw", "刷新终端列表", () => this.plugin.refresh());
    this.search = makeElement(this.contentEl, "input", "tsn-search");
    this.search.type = "search";
    this.search.placeholder = "搜索名称、分组或目录…";
    this.search.setAttribute("aria-label", "搜索终端会话");
    this.search.addEventListener("input", () => { this.query = this.search.value; this.render(); });
    this.search.addEventListener("keydown", event => {
      if (event.key === "Escape" && this.query) {
        event.preventDefault(); this.query = ""; this.search.value = ""; this.render();
      } else if (event.key === "ArrowDown") {
        const first = this.listEl?.querySelector(".tsn-session-select");
        if (first) { event.preventDefault(); first.focus(); }
      } else if (event.key === "Enter" && !event.isComposing) {
        const first = this.listEl?.querySelector(".tsn-session-select");
        if (first) { event.preventDefault(); first.click(); }
      }
    });
    this.listEl = makeElement(this.contentEl, "div", "tsn-list");
    this.listEl.setAttribute("aria-label", "已打开的终端");
    this.listEl.addEventListener("keydown", event => this.onListKeydown(event));
    makeElement(this.contentEl, "div", "tsn-footer", "点击切换 · 双击名称或右键编辑");
    this.render();
  }

  async onClose() {
    this.rows.clear();
    this.contentEl.classList.remove("tsn-view");
    this.contentEl.replaceChildren();
  }

  focusSearch() { this.search?.focus(); this.search?.select(); }

  updateSelection() {
    for (const [id, row] of this.rows) {
      const selected = id === this.plugin.lastTerminalId;
      row.classList.toggle("is-active", selected);
      row.querySelector(".tsn-session-select")?.setAttribute("aria-current", String(selected));
    }
  }

  render() {
    if (!this.listEl) return;
    const doc = this.contentEl.ownerDocument;
    const focusedId = doc.activeElement?.closest?.("[data-tsn-id]")?.getAttribute("data-tsn-id");
    const focusedGroup = doc.activeElement?.classList?.contains("tsn-group-toggle")
      ? doc.activeElement.closest("[data-tsn-group]").getAttribute("data-tsn-group") : null;
    const previousScroll = this.listEl.scrollTop;
    const sessions = this.plugin.sessions;
    const query = this.query.trim().toLocaleLowerCase();
    const filtered = sessions.filter(session => [session.name, session.cwd, this.plugin.groupName(session.groupId)]
      .some(value => value.toLocaleLowerCase().includes(query)));
    this.countEl.textContent = query ? `${filtered.length}/${sessions.length}` : String(sessions.length);
    this.rows.clear();
    this.listEl.replaceChildren();
    if (!sessions.length) {
      makeElement(this.listEl, "p", "tsn-empty", "还没有打开的 Terminal 终端。用你原来的 Terminal 命令打开终端后，它会自动出现在这里。");
      return;
    }
    if (!filtered.length) {
      makeElement(this.listEl, "p", "tsn-empty", "没有匹配的会话。");
      return;
    }
    const groups = [...this.plugin.data.groups, { id: UNGROUPED, name: "未分组", collapsed: this.plugin.data.ungroupedCollapsed }];
    for (const group of groups) {
      const items = filtered.filter(session => session.groupId === group.id);
      if (!items.length && (query || group.id === UNGROUPED)) continue;
      const section = makeElement(this.listEl, "section", "tsn-group");
      section.setAttribute("data-tsn-group", group.id);
      const heading = makeElement(section, "div", "tsn-group-header");
      const toggle = makeElement(heading, "button", "tsn-group-toggle");
      toggle.type = "button";
      const open = !!query || !group.collapsed;
      toggle.setAttribute("aria-expanded", String(open));
      const arrow = makeElement(toggle, "span", "tsn-group-arrow");
      setIcon(arrow, open ? "chevron-down" : "chevron-right");
      makeElement(toggle, "span", "tsn-group-name", group.name);
      makeElement(toggle, "span", "tsn-group-count", String(items.length));
      toggle.addEventListener("click", () => {
        if (!query) this.plugin.toggleGroup(group.id);
      });
      if (group.id !== UNGROUPED) {
        iconButton(heading, "ellipsis", `管理分组：${group.name}`, event => this.plugin.showGroupMenu(group.id, event));
      }
      if (!open) continue;
      if (!items.length) makeElement(section, "p", "tsn-empty-group", "在会话菜单中移入此分组");
      for (const session of items) {
        const row = makeElement(section, "div", "tsn-session");
        row.setAttribute("data-tsn-id", session.id);
        const select = makeElement(row, "button", "tsn-session-select");
        select.type = "button";
        select.setAttribute("aria-label", `切换到 ${session.name}`);
        const icon = makeElement(select, "span", "tsn-terminal-icon");
        setIcon(icon, "terminal");
        const text = makeElement(select, "span", "tsn-session-text");
        makeElement(text, "span", "tsn-session-name", session.name);
        makeElement(text, "span", "tsn-session-detail", `${String(session.ordinal).padStart(2, "0")} · ${session.directoryLabel}`);
        select.addEventListener("click", () => this.plugin.focusSession(session.id));
        select.addEventListener("dblclick", event => { event.preventDefault(); this.plugin.promptRename(session.id); });
        row.addEventListener("contextmenu", event => { event.preventDefault(); this.plugin.showSessionMenu(session.id, event); });
        iconButton(row, "ellipsis", `编辑 ${session.name}`, event => this.plugin.showSessionMenu(session.id, event));
        this.rows.set(session.id, row);
      }
    }
    this.updateSelection();
    this.listEl.scrollTop = previousScroll;
    if (focusedId) this.rows.get(focusedId)?.querySelector(".tsn-session-select")?.focus({ preventScroll: true });
    else if (focusedGroup !== null) {
      const group = Array.from(this.listEl.querySelectorAll("[data-tsn-group]")).find(element => element.getAttribute("data-tsn-group") === focusedGroup);
      group?.querySelector(".tsn-group-toggle")?.focus({ preventScroll: true });
    }
  }

  onListKeydown(event) {
    const button = event.target.closest?.(".tsn-session-select");
    if (!button) return;
    const id = button.closest("[data-tsn-id]").getAttribute("data-tsn-id");
    if (event.key === "F2") { event.preventDefault(); this.plugin.promptRename(id); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(this.listEl.querySelectorAll(".tsn-session-select"));
    const next = buttons[buttons.indexOf(button) + (event.key === "ArrowDown" ? 1 : -1)];
    if (next) { event.preventDefault(); next.focus(); }
  }
}

module.exports = class TerminalSessionNavigator extends Plugin {
  async onload() {
    this.data = normalizeData(await this.loadData());
    this.sessions = [];
    this.lastTerminalId = null;
    this.saveQueue = Promise.resolve();
    this.refreshTimer = null;
    this.disposed = false;
    this.fallbackIds = new WeakMap();
    this.fallbackCounter = 0;
    this.runtimePrefix = `runtime-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    this.registerView(VIEW_TYPE, leaf => new NavigatorView(leaf, this));
    this.addRibbonIcon("list-tree", "终端会话导航", () => this.openNavigator(true));
    this.addCommand({ id: "open", name: "打开终端会话列表", callback: () => this.openNavigator(true) });
    this.addCommand({ id: "search", name: "搜索终端会话", callback: () => this.openNavigator(true) });
    this.addCommand({ id: "rename-current", name: "重命名当前终端", checkCallback: checking => {
      const id = this.currentTerminalId();
      if (!id) return false;
      if (!checking) this.promptRename(id);
      return true;
    } });
    this.addCommand({ id: "group-current", name: "将当前终端移入分组", checkCallback: checking => {
      const id = this.currentTerminalId();
      if (!id) return false;
      if (!checking) new GroupPickerModal(this, id).open();
      return true;
    } });
    this.addCommand({ id: "new-group", name: "新建终端分组", callback: () => this.promptCreateGroup() });
    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleRefresh()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => {
      if (leaf?.view?.getViewType?.() === TERMINAL_TYPE) this.lastTerminalId = this.leafId(leaf);
      for (const view of this.navigatorViews()) view.updateSelection();
      this.scheduleRefresh();
    }));
    this.register(() => { this.disposed = true; clearTimeout(this.refreshTimer); });
    this.app.workspace.onLayoutReady(() => {
      if (this.disposed) return;
      this.refresh();
      // Show the new navigation pane without restarting or replacing a terminal.
      this.openNavigator(false).catch(error => {
        console.error("Terminal Session Navigator: open failed", error);
        new Notice("终端会话导航未能自动打开，请从命令面板打开。");
      });
    });
  }

  onunload() {
    this.disposed = true;
    clearTimeout(this.refreshTimer);
    // Only our navigation views are detached. Terminal leaves are never detached.
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  leafId(leaf) {
    // Obsidian preserves this workspace leaf ID when restoring its saved layout.
    // No matching by folder/title: different terminals often share both values.
    if (typeof leaf.id === "string" && leaf.id) return leaf.id;
    if (!this.fallbackIds.has(leaf)) this.fallbackIds.set(leaf, `${this.runtimePrefix}-${++this.fallbackCounter}`);
    return this.fallbackIds.get(leaf);
  }

  navigatorViews() {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE).map(leaf => leaf.view).filter(view => view instanceof NavigatorView);
  }

  scheduleRefresh() {
    if (this.disposed) return;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => { this.refreshTimer = null; this.refresh(); }, 80);
  }

  refresh() {
    if (this.disposed) return;
    let changed = false;
    const sessions = [];
    const leaves = this.app.workspace.getLeavesOfType(TERMINAL_TYPE);
    const validGroups = new Set(this.data.groups.map(group => group.id));
    for (const leaf of leaves) {
      const id = this.leafId(leaf);
      if (!own(this.data.sessions, id)) {
        this.data.sessions[id] = { name: "", groupId: UNGROUPED, ordinal: this.data.nextOrdinal++ };
        changed = true;
      }
      const metadata = this.data.sessions[id];
      if (metadata.groupId && !validGroups.has(metadata.groupId)) { metadata.groupId = UNGROUPED; changed = true; }
      let cwd = "";
      try {
        // Read only cwd. getState()/JSON serialization can copy huge terminal scrollback.
        const candidate = leaf.view?.state?.cwd;
        if (typeof candidate === "string") cwd = candidate;
      } catch (_) { /* A deferred/new Terminal view may not have initialized yet. */ }
      const directoryLabel = cwd.split(/[\\/]/).filter(Boolean).pop() || "Terminal";
      sessions.push({ id, leaf, cwd, directoryLabel, ...metadata, name: metadata.name || `终端 ${String(metadata.ordinal).padStart(2, "0")}` });
    }
    sessions.sort((a, b) => a.ordinal - b.ordinal);
    const active = this.app.workspace.activeLeaf;
    if (active?.view?.getViewType?.() === TERMINAL_TYPE) this.lastTerminalId = this.leafId(active);
    if (!sessions.some(session => session.id === this.lastTerminalId)) this.lastTerminalId = null;
    const before = JSON.stringify(this.sessions.map(({ leaf, ...entry }) => entry));
    const after = JSON.stringify(sessions.map(({ leaf, ...entry }) => entry));
    this.sessions = sessions;
    if (changed) this.persist();
    for (const view of this.navigatorViews()) {
      if (before !== after) view.render();
      else view.updateSelection();
    }
  }

  persist() {
    const snapshot = JSON.parse(JSON.stringify(this.data));
    this.saveQueue = this.saveQueue.then(() => this.saveData(snapshot)).then(() => true, error => {
      console.error("Terminal Session Navigator: metadata save failed", error);
      new Notice("终端名称或分组暂未保存到磁盘，请检查 vault 的写入权限后重试。");
      return false;
    });
    return this.saveQueue;
  }

  groupName(id) { return this.data.groups.find(group => group.id === id)?.name || "未分组"; }

  currentTerminalId() {
    const active = this.app.workspace.activeLeaf;
    if (active?.view?.getViewType?.() === TERMINAL_TYPE) return this.leafId(active);
    return this.sessions.some(session => session.id === this.lastTerminalId) ? this.lastTerminalId : null;
  }

  navigationAnchor() {
    const workspace = this.app.workspace;
    const notes = workspace.getLeavesOfType("markdown").filter(leaf => leaf.getRoot?.() === workspace.rootSplit);
    const visible = notes.filter(leaf => leaf.containerEl.getBoundingClientRect().width > 0);
    visible.sort((a, b) => b.containerEl.getBoundingClientRect().right - a.containerEl.getBoundingClientRect().right);
    return visible[0] || notes[notes.length - 1] || null;
  }

  sizeNavigationPane(leaf) {
    const tabs = leaf.parent;
    const split = tabs?.parent;
    if (!split?.children?.includes(tabs) || split.children.length < 2 || split.direction !== "vertical") return;
    const width = split.containerEl.getBoundingClientRect().width;
    if (width < 480 || split.children.some(child => typeof child.setDimension !== "function")) return;
    const fraction = Math.min(35, Math.max(10, 240 / width * 100));
    const others = split.children.filter(child => child !== tabs);
    const widths = others.map(child => Math.max(1, child.containerEl.getBoundingClientRect().width));
    const total = widths.reduce((sum, value) => sum + value, 0);
    tabs.setDimension(fraction);
    others.forEach((child, index) => child.setDimension((100 - fraction) * widths[index] / total));
    this.app.workspace.requestResize();
    this.app.workspace.requestSaveLayout();
  }

  async openNavigator(focusSearch = true) {
    if (this.disposed) return;
    if (this.opening) return this.opening;
    this.opening = (async () => {
      const previous = this.app.workspace.activeLeaf;
      let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
      if (!leaf) {
        const anchor = this.navigationAnchor();
        leaf = anchor ? this.app.workspace.createLeafBySplit(anchor, "vertical", false) : this.app.workspace.getLeftLeaf(false);
        if (!leaf) throw new Error("No navigation leaf available");
        await leaf.setViewState({ type: VIEW_TYPE, active: false });
        if (anchor) this.sizeNavigationPane(leaf);
      }
      await this.app.workspace.revealLeaf(leaf);
      if (focusSearch) leaf.view.focusSearch?.();
      else if (previous) this.app.workspace.setActiveLeaf(previous, { focus: false });
      return leaf;
    })();
    try { return await this.opening; } finally { this.opening = null; }
  }

  async focusSession(id) {
    // Resolve again at click time: a terminal might have been closed since render.
    const leaf = this.app.workspace.getLeavesOfType(TERMINAL_TYPE).find(item => this.leafId(item) === id);
    if (!leaf) { this.refresh(); new Notice("该终端标签已经关闭。"); return false; }
    try {
      await this.app.workspace.revealLeaf(leaf);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
      // Terminal 3.23 exposes focus(); fallback uses xterm's existing input element.
      if (typeof leaf.view.focus === "function") leaf.view.focus();
      else leaf.view.contentEl?.querySelector(".xterm-helper-textarea")?.focus({ preventScroll: true });
      this.lastTerminalId = id;
      for (const view of this.navigatorViews()) view.updateSelection();
      return true;
    } catch (error) {
      console.error("Terminal Session Navigator: focus failed", error);
      new Notice("无法切换到这个终端，请刷新列表后重试。");
      return false;
    }
  }

  renameSession(id, name) {
    if (!own(this.data.sessions, id)) return false;
    this.data.sessions[id].name = cleanText(name);
    const saved = this.persist();
    this.refresh();
    return saved;
  }

  moveSession(id, groupId) {
    if (!own(this.data.sessions, id)) return false;
    if (groupId && !this.data.groups.some(group => group.id === groupId)) return false;
    this.data.sessions[id].groupId = groupId;
    const saved = this.persist();
    this.refresh();
    return saved;
  }

  toggleGroup(id) {
    if (id === UNGROUPED) {
      this.data.ungroupedCollapsed = !this.data.ungroupedCollapsed;
      this.persist();
      for (const view of this.navigatorViews()) view.render();
      return;
    }
    const group = this.data.groups.find(item => item.id === id);
    if (!group) return;
    group.collapsed = !group.collapsed;
    this.persist();
    for (const view of this.navigatorViews()) view.render();
  }

  createGroup(name) {
    const clean = cleanText(name, 40);
    if (!clean) return { error: "请输入分组名称。" };
    if (clean === "未分组" || this.data.groups.some(group => group.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) return { error: "这个分组名称已经存在。" };
    const id = `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    this.data.groups.push({ id, name: clean, collapsed: false });
    this.persist();
    for (const view of this.navigatorViews()) view.render();
    return { id };
  }

  renameGroup(id, name) {
    const group = this.data.groups.find(item => item.id === id);
    const clean = cleanText(name, 40);
    if (!group || !clean) return "请输入分组名称。";
    if (clean === "未分组" || this.data.groups.some(item => item.id !== id && item.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) return "这个分组名称已经存在。";
    group.name = clean;
    this.persist();
    for (const view of this.navigatorViews()) view.render();
  }

  deleteGroup(id) {
    if (!this.data.groups.some(group => group.id === id)) return;
    this.data.groups = this.data.groups.filter(group => group.id !== id);
    for (const metadata of Object.values(this.data.sessions)) if (metadata.groupId === id) metadata.groupId = UNGROUPED;
    this.persist();
    this.refresh();
    for (const view of this.navigatorViews()) view.render();
  }

  promptRename(id) {
    const metadata = this.data.sessions[id];
    if (!metadata) return;
    new TextInputModal(this.app, "重命名终端", metadata.name, `终端 ${String(metadata.ordinal).padStart(2, "0")}`,
      async name => { const saved = await this.renameSession(id, name); if (!saved) return "保存失败，请重试。"; }, true).open();
  }

  promptCreateGroup(afterCreate) {
    new TextInputModal(this.app, "新建终端分组", "", "例如：科研、Simple、生活", name => {
      const result = this.createGroup(name);
      if (result.error) return result.error;
      afterCreate?.(result.id);
    }).open();
  }

  showSessionMenu(id, event) {
    const metadata = this.data.sessions[id];
    if (!metadata) return;
    const menu = new Menu().setUseNativeMenu(false);
    menu.addItem(item => item.setTitle("重命名…").setIcon("pencil").onClick(() => this.promptRename(id)));
    menu.addItem(item => item.setTitle(`移动到分组…（${this.groupName(metadata.groupId)}）`).setIcon("folder").onClick(() => new GroupPickerModal(this, id).open()));
    menu.showAtMouseEvent(event);
  }

  showGroupMenu(id, event) {
    const group = this.data.groups.find(item => item.id === id);
    if (!group) return;
    const menu = new Menu().setUseNativeMenu(false);
    menu.addItem(item => item.setTitle("重命名分组…").setIcon("pencil").onClick(() => {
      new TextInputModal(this.app, "重命名分组", group.name, "分组名称", name => this.renameGroup(id, name)).open();
    }));
    menu.addItem(item => item.setTitle("移除分组（会话移入未分组）").setIcon("folder-minus").onClick(() => this.deleteGroup(id)));
    menu.showAtMouseEvent(event);
  }
};
