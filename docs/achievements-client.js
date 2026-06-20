/**
 * 学员端 · 成就墙 / 佩戴徽章 / 排行榜展示
 */
(function () {
  var state = {
    items: [],
    achievements: {},
    equippedBadges: [],
    equippedSummary: [],
    loading: false,
    pickingSlot: -1,
  };

  function apiBase() {
    return (window.getApiBase && window.getApiBase()) || "";
  }

  function authHeaders() {
    return window.getAuthHeaders ? window.getAuthHeaders() : {};
  }

  function currentUsername() {
    return window.loadCurrentUsername ? window.loadCurrentUsername() : "";
  }

  function escapeHtml(s) {
    if (window.escapeHtml) return window.escapeHtml(s);
    var div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  function showToast(msg) {
    if (typeof window.showToast === "function") window.showToast(msg);
  }

  function groupByCategory(items) {
    var map = new Map();
    (items || []).forEach(function (item) {
      var cat = item.category || "其他";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(item);
    });
    return map;
  }

  function renderProgress(item) {
    if (item.unlocked) return '<span class="ach-progress ach-progress-done">已解锁</span>';
    var p = item.progress;
    if (!p || p.target == null) {
      return '<span class="ach-progress">' + escapeHtml(item.hint || "") + "</span>";
    }
    var cur = p.current != null ? p.current : 0;
    var tgt = p.target != null ? p.target : 0;
    var pct = tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
    return (
      '<div class="ach-progress-bar-wrap">' +
      '<div class="ach-progress-bar"><div class="ach-progress-bar-fill" style="width:' +
      pct +
      '%"></div></div>' +
      '<span class="ach-progress-text">' +
      escapeHtml(String(cur) + " / " + String(tgt)) +
      "</span></div>"
    );
  }

  function renderWall() {
    var body = document.getElementById("achievement-wall-body");
    if (!body) return;
    if (state.loading) {
      body.innerHTML = '<div class="panel-empty">加载中…</div>';
      return;
    }
    var items = state.items || [];
    if (!items.length) {
      body.innerHTML = '<div class="panel-empty">暂无成就配置。</div>';
      return;
    }
    var equipped = state.equippedBadges || [];
    var equipHtml =
      '<div class="ach-equip-panel">' +
      "<h3>佩戴徽章（最多 3 枚）</h3>" +
      '<div class="ach-equip-slots">' +
      [0, 1, 2]
        .map(function (idx) {
          var id = equipped[idx] || "";
          var item = items.find(function (x) {
            return x.id === id;
          });
          var label = item ? item.icon + " " + item.name : "空槽";
          return (
            '<button type="button" class="ach-equip-slot' +
            (item ? " filled" : "") +
            '" data-slot="' +
            idx +
            '" title="点击更换">' +
            escapeHtml(label) +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      '<p class="ach-equip-hint muted">新解锁不会自动佩戴；点槽位选择已解锁成就。</p>' +
      (state.pickingSlot >= 0 ? renderEquipPicker(state.pickingSlot) : "") +
      "</div>";

    var groups = groupByCategory(items);
    var listHtml = "";
    groups.forEach(function (catItems, cat) {
      listHtml += '<div class="ach-category"><h3 class="ach-category-title">' + escapeHtml(cat) + "</h3><ul class="ach-list">";
      catItems.forEach(function (item) {
        var locked = !item.unlocked;
        listHtml +=
          '<li class="ach-item' +
          (locked ? " ach-item-locked" : " ach-item-unlocked") +
          '" data-id="' +
          escapeHtml(item.id) +
          '">' +
          '<div class="ach-item-icon">' +
          escapeHtml(item.icon || "🏅") +
          "</div>" +
          '<div class="ach-item-main">' +
          '<div class="ach-item-title">' +
          escapeHtml(item.name || item.id) +
          (item.tier ? '<span class="ach-tier">' + escapeHtml(item.tier) + "</span>" : "") +
          "</div>" +
          renderProgress(item) +
          (item.xpReward ? '<div class="ach-xp">+' + escapeHtml(String(item.xpReward)) + " XP</div>" : "") +
          "</div></li>";
      });
      listHtml += "</ul></div>";
    });

    body.innerHTML = equipHtml + listHtml;
    body.querySelectorAll(".ach-equip-slot").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.pickingSlot = parseInt(btn.getAttribute("data-slot"), 10) || 0;
        renderWall();
      });
    });
    body.querySelectorAll("[data-equip-pick]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var slot = state.pickingSlot;
        var id = btn.getAttribute("data-equip-pick") || "";
        state.pickingSlot = -1;
        applyEquipSlot(slot, id);
      });
    });
    var cancelPick = body.querySelector("[data-equip-cancel]");
    if (cancelPick) {
      cancelPick.addEventListener("click", function () {
        state.pickingSlot = -1;
        renderWall();
      });
    }
  }

  function renderEquipPicker(slotIndex) {
    var unlocked = (state.items || []).filter(function (x) {
      return x.unlocked;
    });
    var chips =
      '<button type="button" class="ach-equip-pick ach-equip-pick-clear" data-equip-pick="">清除</button>' +
      unlocked
        .map(function (item) {
          return (
            '<button type="button" class="ach-equip-pick" data-equip-pick="' +
            escapeHtml(item.id) +
            '">' +
            escapeHtml((item.icon || "") + " " + (item.name || item.id)) +
            "</button>"
          );
        })
        .join("");
    return (
      '<div class="ach-equip-picker">' +
      "<p>为槽位 " +
      (slotIndex + 1) +
      ' 选择：</p><div class="ach-equip-picker-row">' +
      chips +
      '</div><button type="button" class="ach-equip-pick-cancel" data-equip-cancel>取消</button></div>'
    );
  }

  function openEquipPicker(slotIndex) {
    state.pickingSlot = slotIndex;
    renderWall();
  }

  function applyEquipSlot(slotIndex, achievementId) {
    var next = (state.equippedBadges || []).slice(0, 3);
    while (next.length < 3) next.push("");
    next[slotIndex] = achievementId || "";
    var cleaned = [];
    var seen = new Set();
    next.forEach(function (id) {
      if (!id || seen.has(id)) return;
      var item = (state.items || []).find(function (x) {
        return x.id === id && x.unlocked;
      });
      if (!item) return;
      seen.add(id);
      cleaned.push(id);
    });
    saveEquipped(cleaned);
  }

  function saveEquipped(ids) {
    var name = currentUsername();
    var base = apiBase();
    if (!name || !base) return Promise.resolve();
    return fetch(base + "/api/user/" + encodeURIComponent(name) + "/achievements/equipped", {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
      credentials: "include",
      body: JSON.stringify({ equippedBadges: ids }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || "保存失败");
        state.equippedBadges = Array.isArray(data.equippedBadges) ? data.equippedBadges : ids;
        state.equippedSummary = Array.isArray(data.equippedSummary) ? data.equippedSummary : [];
        if (window.cachedUser) {
          window.cachedUser.equippedBadges = state.equippedBadges.slice();
          window.cachedUser.achievements = Object.assign({}, state.achievements);
        }
        renderWall();
        renderHomeBadges();
      })
      .catch(function (e) {
        showToast(e.message || String(e));
      });
  }

  function renderHomeBadges() {
    var el = document.getElementById("home-equipped-badges");
    if (!el) return;
    var summary = state.equippedSummary && state.equippedSummary.length
      ? state.equippedSummary
      : buildSummaryFromEquipped();
    if (!summary.length) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = summary
      .map(function (b) {
        return (
          '<span class="home-badge-chip" title="' +
          escapeHtml(b.name || "") +
          '">' +
          escapeHtml(b.icon || "🏅") +
          "</span>"
        );
      })
      .join("");
  }

  function buildSummaryFromEquipped() {
    return (state.equippedBadges || [])
      .map(function (id) {
        var item = (state.items || []).find(function (x) {
          return x.id === id;
        });
        if (!item) return null;
        return { id: item.id, name: item.name, icon: item.icon };
      })
      .filter(Boolean);
  }

  function buildRankingBadgesHtml(badges) {
    if (!Array.isArray(badges) || !badges.length) return "";
    return (
      '<span class="rank-equipped-badges">' +
      badges
        .map(function (b) {
          return (
            '<span class="rank-badge-chip" title="' +
            escapeHtml(b.name || "") +
            '">' +
            escapeHtml(b.icon || "🏅") +
            "</span>"
          );
        })
        .join("") +
      "</span>"
    );
  }

  function loadState() {
    var name = currentUsername();
    var base = apiBase();
    if (!name || !base) {
      state.items = [];
      state.achievements = {};
      state.equippedBadges = [];
      state.equippedSummary = [];
      renderHomeBadges();
      return Promise.resolve();
    }
    state.loading = true;
    renderWall();
    return fetch(base + "/api/user/" + encodeURIComponent(name) + "/achievements", {
      credentials: "include",
      headers: authHeaders(),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || "加载失败");
        state.items = Array.isArray(data.items) ? data.items : [];
        state.achievements = data.achievements && typeof data.achievements === "object" ? data.achievements : {};
        state.equippedBadges = Array.isArray(data.equippedBadges) ? data.equippedBadges : [];
        state.equippedSummary = buildSummaryFromEquipped();
        if (window.cachedUser) {
          window.cachedUser.achievements = Object.assign({}, state.achievements);
          window.cachedUser.equippedBadges = state.equippedBadges.slice();
        }
      })
      .catch(function (e) {
        console.warn("加载成就失败", e);
      })
      .finally(function () {
        state.loading = false;
        renderWall();
        renderHomeBadges();
      });
  }

  function handleNewAchievementsFromSync(list) {
    if (!Array.isArray(list) || !list.length) return;
    var first = list[0];
    var xpPart = first.xpReward ? "（+" + first.xpReward + " XP）" : "";
    showToast("解锁成就：" + (first.icon || "") + " " + (first.name || first.id) + xpPart);
    if (list.length > 1) {
      setTimeout(function () {
        showToast("另有 " + (list.length - 1) + " 个成就已解锁");
      }, 1200);
    }
    return loadState();
  }

  function applySync(sync) {
    if (!sync || typeof sync !== "object") return;
    if (sync.achievements) state.achievements = Object.assign({}, sync.achievements);
    if (sync.equippedBadges) state.equippedBadges = sync.equippedBadges.slice();
    state.equippedSummary = buildSummaryFromEquipped();
    if (sync.newAchievements && sync.newAchievements.length) {
      handleNewAchievementsFromSync(sync.newAchievements);
    } else {
      renderHomeBadges();
      var sec = document.getElementById("achievement-wall-section");
      if (sec && sec.style.display !== "none") renderWall();
    }
  }

  function showWall() {
    if (typeof window.showHomeSection === "function") {
      window.hideAllMainSections && window.hideAllMainSections();
    }
    var home = document.getElementById("home-section");
    if (home) home.classList.add("hidden");
    var sec = document.getElementById("achievement-wall-section");
    if (sec) sec.style.display = "block";
    loadState();
  }

  function hideWall() {
    var sec = document.getElementById("achievement-wall-section");
    if (sec) sec.style.display = "none";
  }

  window.JmlAchievementsClient = {
    init: function () {
      var backBtn = document.getElementById("achievement-wall-back-btn");
      if (backBtn) {
        backBtn.addEventListener("click", function () {
          hideWall();
          if (typeof window.showHome === "function") window.showHome();
        });
      }
    },
    loadState: loadState,
    showWall: showWall,
    hideWall: hideWall,
    renderHomeBadges: renderHomeBadges,
    buildRankingBadgesHtml: buildRankingBadgesHtml,
    applySync: applySync,
    handleNewAchievementsFromSync: handleNewAchievementsFromSync,
  };
})();
