// ============================================================================
// bulletin-board.js — Community Bulletin Board
// Cards with "My Pipedream" + "What I Have to Offer" sections
// $1 per card posting fee via Stripe
// ============================================================================

// ── State ───────────────────────────────────────────────────────────────────
let bulletinCurrentPage = 1;

// ── Load & Render ───────────────────────────────────────────────────────────

/**
 * Load bulletin board cards from the API
 */
async function loadBulletinBoard(page = 1) {
    bulletinCurrentPage = page;

    const grid = document.getElementById("bulletinGrid");
    const pagination = document.getElementById("bulletinPagination");
    if (!grid) return;

    // Show loading state
    grid.innerHTML = '<div class="bulletin-loading">Loading bulletin board…</div>';

    const pageSize = document.getElementById("bulletinPageSize")?.value || 50;
    const search = document.getElementById("bulletinSearchInput")?.value?.trim() || "";
    const section = document.getElementById("bulletinSectionFilter")?.value || "both";

    let url = `${(import.meta.env.VITE_API_BASE || "")}/v1/bulletin-board?page=${page}&pageSize=${pageSize}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (section !== "both") url += `&section=${section}`;

    try {
        const resp = await fetch(url);
        const data = await resp.json();

        if (!data.success || !data.cards?.length) {
            grid.innerHTML = `
                <div class="bulletin-empty">
                    <div style="font-size: 48px; margin-bottom: 15px;">📌</div>
                    <h4>No cards yet!</h4>
                    <p>Be the first to post on the community bulletin board.</p>
                </div>`;
            if (pagination) pagination.innerHTML = "";
            return;
        }

        // Render cards
        grid.innerHTML = data.cards.map(card => renderBulletinCard(card)).join("");

        // Render pagination
        if (pagination && data.pagination) {
            renderBulletinPagination(pagination, data.pagination);
        }
    } catch (err) {
        console.error("Failed to load bulletin board:", err);
        grid.innerHTML = '<div class="bulletin-empty"><p>Failed to load bulletin board. Please try again.</p></div>';
    }
}

/**
 * Render a single bulletin card
 */
function renderBulletinCard(card) {
    const userName = card.user
        ? `${card.user.firstName || ""} ${card.user.lastName || ""}`.trim() || "Anonymous"
        : "Anonymous";
    const dateStr = new Date(card.createdAt).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric"
    });
    const title = card.title ? `<h4 class="bulletin-card-title">${escapeHtml(card.title)}</h4>` : "";

    return `
    <div class="bulletin-card" data-id="${card.id}">
        ${title}
        <div class="bulletin-card-sections">
            <div class="bulletin-section bulletin-pipedream">
                <div class="bulletin-section-label">💭 My Pipedream</div>
                <p>${escapeHtml(card.myPipedream)}</p>
            </div>
            <div class="bulletin-section bulletin-offers">
                <div class="bulletin-section-label">🤝 What I Have to Offer</div>
                <p>${escapeHtml(card.whatIHaveToOffer)}</p>
            </div>
        </div>
        <div class="bulletin-card-footer">
            <span class="bulletin-author">👤 ${escapeHtml(userName)}</span>
            <span class="bulletin-date">📅 ${dateStr}</span>
        </div>
    </div>`;
}

/**
 * Render pagination controls
 */
function renderBulletinPagination(container, pag) {
    if (pag.totalPages <= 1) {
        container.innerHTML = "";
        return;
    }

    let html = '<div class="pagination-controls">';

    // Previous button
    if (pag.page > 1) {
        html += `<button class="btn-secondary btn-sm" onclick="loadBulletinBoard(${pag.page - 1})">← Prev</button>`;
    }

    // Page numbers
    const start = Math.max(1, pag.page - 2);
    const end = Math.min(pag.totalPages, pag.page + 2);
    for (let i = start; i <= end; i++) {
        const activeClass = i === pag.page ? "btn-primary" : "btn-secondary";
        html += `<button class="${activeClass} btn-sm" onclick="loadBulletinBoard(${i})">${i}</button>`;
    }

    // Next button
    if (pag.page < pag.totalPages) {
        html += `<button class="btn-secondary btn-sm" onclick="loadBulletinBoard(${pag.page + 1})">Next →</button>`;
    }

    html += `<span class="pagination-info">${pag.total} cards</span>`;
    html += "</div>";
    container.innerHTML = html;
}

// ── Search ──────────────────────────────────────────────────────────────────

function searchBulletin() {
    loadBulletinBoard(1);
}

// ── Post Card Modal ─────────────────────────────────────────────────────────

function showPostBulletinModal() {
    if (!window.authService?.isAuthenticated()) {
        alert("Please sign in to post a bulletin card.");
        if (typeof showLoginModal === "function") showLoginModal();
        return;
    }

    // Create modal if it doesn't exist
    let modal = document.getElementById("postBulletinModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "postBulletinModal";
        modal.className = "modal";
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
    <div class="modal-content bulletin-modal">
        <div class="modal-header">
            <h3>📌 Post a Bulletin Card</h3>
            <button class="modal-close" onclick="closePostBulletinModal()">&times;</button>
        </div>
        <div class="modal-body">
            <p class="bulletin-fee-notice">📋 Posting fee: <strong>$1.00</strong> — charged to your card on file</p>
            
            <div class="form-group">
                <label for="bulletinTitle">Title (optional)</label>
                <input type="text" id="bulletinTitle" placeholder="Give your card a headline..." maxlength="100">
            </div>
            
            <div class="form-group">
                <label for="bulletinPipedream">💭 My Pipedream <span class="required">*</span></label>
                <textarea id="bulletinPipedream" rows="4" placeholder="What's your dream project or what are you looking for?" required></textarea>
            </div>
            
            <div class="form-group">
                <label for="bulletinOffers">🤝 What I Have to Offer <span class="required">*</span></label>
                <textarea id="bulletinOffers" rows="4" placeholder="What skills, products, or services can you offer?" required></textarea>
            </div>
            
            <div id="bulletinPostError" class="error-message" style="display: none;"></div>
        </div>
        <div class="modal-footer">
            <button class="btn-secondary" onclick="closePostBulletinModal()">Cancel</button>
            <button class="btn-primary" id="bulletinSubmitBtn" onclick="submitBulletinCard()">Post Card ($1.00)</button>
        </div>
    </div>`;

    modal.classList.add("show");
}

function closePostBulletinModal() {
    const modal = document.getElementById("postBulletinModal");
    if (modal) modal.classList.remove("show");
}

/**
 * Submit a new bulletin card — charges $1 via Stripe
 */
async function submitBulletinCard() {
    if (!window.authService?.isAuthenticated()) return;

    const title = document.getElementById("bulletinTitle")?.value?.trim() || "";
    const myPipedream = document.getElementById("bulletinPipedream")?.value?.trim();
    const whatIHaveToOffer = document.getElementById("bulletinOffers")?.value?.trim();
    const errorEl = document.getElementById("bulletinPostError");
    const submitBtn = document.getElementById("bulletinSubmitBtn");

    // Validation
    if (!myPipedream) {
        errorEl.textContent = 'Please fill in the "My Pipedream" section.';
        errorEl.style.display = "block";
        return;
    }
    if (!whatIHaveToOffer) {
        errorEl.textContent = 'Please fill in the "What I Have to Offer" section.';
        errorEl.style.display = "block";
        return;
    }

    errorEl.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "Processing…";

    try {
        // First get the user's default payment method
        const methodsResp = await apiFetch("/v1/payments/methods");

        if (!methodsResp.ok) {
            throw new Error("Could not retrieve payment methods. Please add a card in Account Settings.");
        }

        const methodsData = await methodsResp.json();
        const paymentMethodId = methodsData.defaultPaymentMethod || methodsData.paymentMethods?.[0]?.id;

        if (!paymentMethodId) {
            throw new Error("No payment method on file. Please add a card in Account Settings first.");
        }

        // Submit the card
        const resp = await apiFetch("/v1/bulletin-board", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                title: title || undefined,
                myPipedream,
                whatIHaveToOffer,
                paymentMethodId,
            }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            throw new Error(data.error || data.details || "Failed to post card");
        }

        // Success!
        closePostBulletinModal();
        loadBulletinBoard(1); // Refresh to show new card
        alert("✅ Your bulletin card has been posted!");
    } catch (err) {
        console.error("Bulletin card post error:", err);
        errorEl.textContent = err.message || "Failed to post card. Please try again.";
        errorEl.style.display = "block";
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Post Card ($1.00)";
    }
}

// ── Expose to window ────────────────────────────────────────────────────────
window.loadBulletinBoard = loadBulletinBoard;
window.searchBulletin = searchBulletin;
window.showPostBulletinModal = showPostBulletinModal;
window.closePostBulletinModal = closePostBulletinModal;
window.submitBulletinCard = submitBulletinCard;
