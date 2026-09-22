import { Routes } from '@angular/router';
import { RolesListComponent } from './roles-list.component';
import { RoleFormComponent } from './role-form.component';

export const ROLES_ROUTES: Routes = [
  { path: '', component: RolesListComponent },
  { path: 'new', component: RoleFormComponent },
  { path: ':id/edit', component: RoleFormComponent },
];