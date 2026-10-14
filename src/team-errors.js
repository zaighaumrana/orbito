// A rejected invocation does not prove that an earlier request never dispatched.
export async function teamErrorMessage(data, error, requestId) {
  let result=data;
  if (!result && error?.context?.clone) {
    try { result=await error.context.clone().json(); } catch { /* Unverifiable response stays uncertain. */ }
  }
  const messages={
    deletion_disabled:'Deletion is disabled until Master session continuity is approved.',
    password_invalid:'The Master password was not accepted.',
    captcha_failed:'Verification expired or was rejected. Complete fresh CAPTCHA verification.',
    verification_failed:'Master verification failed. Check your password and complete fresh CAPTCHA verification.',
    verification_required:'Complete the password, acknowledgment and fresh CAPTCHA.',
    session_expired:'Your session expired. Sign in again before continuing.',
    authorization_denied:'Only the verified Master administrator can perform this action.',
    identity_unavailable:'The employee identity could not be verified; request administrator review.',
    verification_cleanup_required:'Master verification cleanup could not be confirmed; verify your session before continuing.',
    identity_conflict:'The employee identity does not match. Administrator review is required.',
    master_protected:'The Master account is protected and cannot be deleted.',
    invitation_unavailable:'The email or retired identity could not be verified. Refresh and review the employee record before inviting.',
  };
  if (Object.hasOwn(messages,result?.code) && (result?.review_required===false
    || (result?.review_required===true && result?.current_attempt_rejected===true && result?.operation_state==='unverified'))) {
    return `${messages[result.code]} This attempt was rejected; any earlier attempt may still require reconciliation. Review request ${requestId}; do not retry an uncertain Auth operation blindly.`;
  }
  return `Operation could not be confirmed. Review request ${requestId}; do not retry an uncertain Auth operation blindly.`;
}
