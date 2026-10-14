export function shouldShowCheckoutTroubleshooting(showTroubleshooting: boolean, isFulfilled: boolean): boolean {
  return showTroubleshooting && !isFulfilled;
}
