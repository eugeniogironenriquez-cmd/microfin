import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "../core/auth.service";

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const logged = await auth.isLoggedIn();

  if (logged) {
    await auth.loadSession();
    return true;
  }

  return router.createUrlTree(["/login"]);
};