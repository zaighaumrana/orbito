export function userModals(type, md) {

  if (type === "add-platform-user") {
    return `
      <div class="modal-backdrop">
        <div class="modal" style="max-width:460px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h2>Add Team Member</h2>
            <button class="icon-button" data-p-close>✕</button>
          </div>
          <form data-p-form="add-platform-user">
            <div class="form-grid">
              <label class="field"><span>Full Name</span>
                <input name="name" required placeholder="e.g. Sarah Khan"></label>
              <label class="field"><span>Role</span>
                <select name="role" required>
                  <option value="billing_person">Billing Person</option>
                  <option value="portfolio_manager">Portfolio Manager</option>
                </select></label>
              <label class="field" style="grid-column:1/-1"><span>Email</span>
                <input name="email" type="email" required placeholder="user@example.com"></label>
              <label class="field" style="grid-column:1/-1">
                <span>Password</span>
                <input name="password" type="password" required minlength="8"
                  placeholder="Min 8 chars, letter + number + symbol">
              </label>
            </div>
            <div class="modal-actions" style="margin-top:14px">
              <button type="button" class="secondary-button" data-p-close>Cancel</button>
              <button type="submit" class="primary-button">Create User</button>
            </div>
          </form>
        </div>
      </div>`;
  }

  if (type === "edit-platform-user") {
    return `
      <div class="modal-backdrop">
        <div class="modal" style="max-width:460px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h2>Edit Team Member</h2>
            <button class="icon-button" data-p-close>✕</button>
          </div>
          <form data-p-form="edit-platform-user">
            <input type="hidden" name="id"        value="${md.id}">
            <input type="hidden" name="old_email" value="${md.email}">
            <div class="form-grid">
              <label class="field"><span>Full Name</span>
                <input name="name" required value="${md.name}"></label>
              <label class="field"><span>Role</span>
                <select name="role" required>
                  <option value="billing_person"
                    ${md.role === "billing_person" ? "selected" : ""}>Billing Person</option>
                  <option value="portfolio_manager"
                    ${md.role === "portfolio_manager" ? "selected" : ""}>Portfolio Manager</option>
                </select></label>
              <label class="field" style="grid-column:1/-1"><span>Email</span>
                <input name="email" type="email" required value="${md.email}"></label>
              <label class="field" style="grid-column:1/-1">
                <span>New Password
                  <span style="color:var(--muted);font-size:12px">(leave blank to keep current)</span>
                </span>
                <input name="password" type="password" minlength="8"
                  placeholder="Min 8 chars, letter + number + symbol">
              </label>
            </div>
            <div class="modal-actions" style="margin-top:14px">
              <button type="button" class="secondary-button" data-p-close>Cancel</button>
              <button type="submit" class="primary-button">Save Changes</button>
            </div>
          </form>
        </div>
      </div>`;
  }

  return null;
}
