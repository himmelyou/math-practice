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
    equipMode: false,
    detailId: "",
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

  function achievementImageInner(item, className) {
    if (item && item.imageUrl) {
      return (
        '<img class="' +
        className +
        '" src="' +
        escapeHtml(item.imageUrl) +
        '" alt="' +
        escapeHtml(item.name || "") +
        '" loading="lazy" />'
      );
    }
    return (
      '<div class="' +
      className +
      ' ach-img-placeholder">' +
      escapeHtml((item && item.name ? item.name : "?").slice(0, 1)) +
      "</div>"
    );
  }

  function renderBadgeChip(b, chipClass) {
    if (b && b.imageUrl) {
      return (
        '<span class="' +
        chipClass +
        '" title="' +
        escapeHtml(b.name || "") +
        '"><img src="' +
        escapeHtml(b.imageUrl) +
        '" alt="" /></span>'
      );
    }
    return (
      '<span class="' +
      chipClass +
      '" title="' +
      escapeHtml((b && b.name) || "") +
      '">' +
      escapeHtml((b && b.icon) || "🏅") +
      "</span>"
    );
  }

  function formatUnlockTime(ts) {
    if (!ts) return "";
    try {
      var d = new Date(ts);
      if (Number.isNaN(d.getTime())) return "";
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    } catch (e) {
      return "";
    }
  }

  function renderProgressHtml(item) {
    if (item.unlocked) return '<div class="ach-progress-done">已解锁</div>';
    var p = item.progress;
    if (!p || p.target == null) {
      return '<div class="muted">' + escapeHtml(item.hint || "") + "</div>";
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

  function isEquipped(id) {
    return (state.equippedBadges || []).indexOf(id) >= 0;
  }

  function renderSummary() {
    var unlockedCount = (state.items || []).filter(function (x) {
      return x.unlocked;
    }).length;
    var totalCount = (state.items || []).length;
    var countEl = document.getElementById("ach-wall-unlocked-count");
    if (countEl) countEl.textContent = "已解锁 " + unlockedCount + "/" + totalCount;
    var toggle = document.getElementById("ach-wall-equip-toggle");
    if (toggle) {
      toggle.textContent = state.equipMode ? "完成" : "管理佩戴";
      toggle.classList.toggle("active", !!state.equipMode);
    }
    var hint = document.getElementById("ach-wall-equip-hint");
    if (hint) hint.hidden = !state.equipMode;
  }

  function bindEquipToggle() {
    var toggle = document.getElementById("ach-wall-equip-toggle");
    if (!toggle || toggle.dataset.bound === "1") return;
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", function () {
      state.equipMode = !state.equipMode;
      closeDetail();
      renderWall();
    });
  }

  function renderWall() {
    var body = document.getElementById("achievement-wall-body");
    if (!body) return;
    renderSummary();
    if (state.loading) {
      body.innerHTML = '<div class="panel-empty">加载中…</div>';
      body.classList.remove("ach-equip-mode");
      return;
    }
    var items = state.items || [];
    if (!items.length) {
      body.innerHTML = '<div class="panel-empty">暂无成就配置。</div>';
      body.classList.remove("ach-equip-mode");
      return;
    }
    body.classList.toggle("ach-equip-mode", !!state.equipMode);
    var groups = groupByCategory(items);
    var listHtml = "";
    groups.forEach(function (catItems, cat) {
      listHtml += '<div class="ach-category"><h3 class="ach-category-title">' + escapeHtml(cat) + '</h3><div class="ach-grid">';
      catItems.forEach(function (item) {
        var locked = !item.unlocked;
        var equipped = isEquipped(item.id);
        listHtml +=
          '<button type="button" class="ach-cell' +
          (locked ? " ach-cell-locked" : " ach-cell-unlocked") +
          (equipped ? " ach-cell-equipped" : "") +
          '" data-id="' +
          escapeHtml(item.id) +
          '" aria-label="' +
          escapeHtml(item.name || item.id) +
          '">' +
          '<span class="ach-cell-inner">' +
          achievementImageInner(item, "ach-cell-img") +
          "</span></button>";
      });
      listHtml += "</div></div>";
    });
    body.innerHTML = listHtml;
    body.querySelectorAll(".ach-cell").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id") || "";
        var item = (state.items || []).find(function (x) {
          return x.id === id;
        });
        if (!item) return;
        if (state.equipMode) {
          if (!item.unlocked) {
            showToast("尚未解锁");
            return;
          }
          toggleEquip(id);
          return;
        }
        openDetail(id);
      });
    });
  }

  function toggleEquip(id) {
    var next = (state.equippedBadges || []).slice();
    var idx = next.indexOf(id);
    if (idx >= 0) {
      next.splice(idx, 1);
    } else {
      if (next.length >= 3) {
        showToast("最多佩戴 3 枚徽章");
        return;
      }
      next.push(id);
    }
    saveEquipped(next);
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
        state.equippedSummary = Array.isArray(data.equippedSummary) ? data.equippedSummary : buildSummaryFromEquipped();
        if (window.cachedUser) {
          window.cachedUser.equippedBadges = state.equippedBadges.slice();
          window.cachedUser.achievements = Object.assign({}, state.achievements);
        }
        renderWall();
        renderHomeBadges();
        if (state.detailId) openDetail(state.detailId);
      })
      .catch(function (e) {
        showToast(e.message || String(e));
      });
  }

  function closeDetail() {
    state.detailId = "";
    var overlay = document.getElementById("ach-detail-overlay");
    if (overlay) overlay.remove();
  }

  function openDetail(id) {
    var item = (state.items || []).find(function (x) {
      return x.id === id;
    });
    if (!item) return;
    state.detailId = id;
    closeDetail();
    var overlay = document.createElement("div");
    overlay.id = "ach-detail-overlay";
    overlay.className = "ach-detail-overlay";
    var equipped = isEquipped(id);
    var unlockLine = item.unlocked
      ? "解锁于 " + (formatUnlockTime(item.unlockedAt) || "—")
      : item.hint || "完成对应挑战即可解锁";
    overlay.innerHTML =
      '<div class="ach-detail-modal" role="dialog" aria-modal="true">' +
      '<div class="ach-detail-img-wrap">' +
      achievementImageInner(item, "ach-cell-img") +
      "</div>" +
      '<h3 class="ach-detail-title">' +
      escapeHtml(item.name || item.id) +
      (item.tier ? ' <span class="muted">· ' + escapeHtml(item.tier) + "</span>" : "") +
      "</h3>" +
      '<div class="ach-detail-meta">' +
      escapeHtml(unlockLine) +
      "</div>" +
      '<div class="ach-detail-body">' +
      renderProgressHtml(item) +
      "</div>" +
      '<div class="ach-detail-actions">' +
      (item.unlocked
        ? '<button type="button" class="ach-detail-btn ach-detail-btn-primary" id="ach-detail-equip-btn">' +
          (equipped ? "取消佩戴" : "佩戴") +
          "</button>"
        : "") +
      '<button type="button" class="ach-detail-btn" id="ach-detail-close-btn">关闭</button>' +
      "</div></div>";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeDetail();
    });
    var closeBtn = document.getElementById("ach-detail-close-btn");
    if (closeBtn) closeBtn.addEventListener("click", closeDetail);
    var equipBtn = document.getElementById("ach-detail-equip-btn");
    if (equipBtn) {
      equipBtn.addEventListener("click", function () {
        toggleEquip(id);
      });
    }
  }

  function renderHomeBadges() {
    var el = document.getElementById("home-equipped-badges");
    if (!el) return;
    var summary =
      state.equippedSummary && state.equippedSummary.length ? state.equippedSummary : buildSummaryFromEquipped();
    if (!summary.length) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = summary
      .map(function (b) {
        return renderBadgeChip(b, "home-badge-chip");
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
        return { id: item.id, name: item.name, icon: item.icon, imageUrl: item.imageUrl || "" };
      })
      .filter(Boolean);
  }

  function buildRankingBadgesHtml(badges) {
    if (!Array.isArray(badges) || !badges.length) return "";
    return (
      '<span class="rank-equipped-badges">' +
      badges
        .map(function (b) {
          return renderBadgeChip(b, "rank-badge-chip");
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
    showToast("解锁成就：" + (first.name || first.id));
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
    if (sec) sec.style.display = "flex";
    loadState();
  }

  function hideWall() {
    state.equipMode = false;
    closeDetail();
    var sec = document.getElementById("achievement-wall-section");
    if (sec) sec.style.display = "none";
  }

  window.JmlAchievementsClient = {
    init: function () {
      bindEquipToggle();
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
