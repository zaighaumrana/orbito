// Presentation of server-owned status; never infer mail delivery or activation.
export const teamRoles={master_admin:'Master Admin',portfolio_manager:'Portfolio Manager',billing_person:'Billing Person'};
export function teamStatus(user,operation) {
  if(operation?.action==='create')return {label:operation.stage==='review_required'?'Invitation needs review':'Creation pending',tone:'warn',message:'Account creation was not confirmed. Resending is blocked until the original request is reconciled. Clear Failed Invitation checks Auth absence on the server and only clears an unused reservation.'};
  if(operation)return {label:'Operation needs review',tone:'warn',message:'An operation is incomplete. Review its original request before another change. An uncertain Auth action must not be repeated blindly.'};
  if(user.status==='Pending' && !user.auth_user_id)return {label:'Invitation needs review',tone:'warn',message:'The invitation has no verified Auth mapping. Resending is blocked; ask the Master Admin to reconcile the original creation request.'};
  if(user.status==='Active')return {label:'Active',tone:'good',message:'Password setup completed and Platform access is active.'};
  if(user.status==='Inactive')return {label:'Inactive',tone:'bad',message:user.suspended_from?'Access is suspended. Reactivate retains this Auth identity and requires a fresh sign-in.':'Legacy inactive identity requires review. Reactivation is unavailable.'};
  return {label:'Pending setup',tone:'warn',message:'Password setup has not completed. Link expiry, revocation and email delivery cannot be confirmed here. If the link expired, request a fresh native setup email for the existing account.'};
}
