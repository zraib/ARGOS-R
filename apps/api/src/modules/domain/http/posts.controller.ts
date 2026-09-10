// ============================================================================
// ARGOS — adaptateur HTTP du domaine · postes d'opération sur la carte (lot #12)
//
// LIRE suit la visibilité des incidents : qui voit une opération voit ses
// postes. ÉCRIRE relève de `map_edit`, que la matrice n'accorde à personne :
// seul le joker du Super Administrateur pose, déplace ou retire un poste.
// Chaque écriture pousse un signal temps réel ; les postes relisent ce qu'ils
// ont le droit de voir — le signal ne porte rien qu'un identifiant.
// ============================================================================

import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuditMeta, type AuditMetaSetter } from "@/common/decorators/audit-meta.decorator";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { AuthUser } from "@/common/types/auth-user";
import { CreatePostDto, UpdatePostDto } from "@/modules/domain/dto";
import { DomainService } from "@/modules/domain/domain.service";
import { VisibilityService } from "@/modules/domain/visibility.service";
import { RealtimeService } from "@/modules/realtime/realtime.service";

@ApiTags("domain")
@ApiBearerAuth()
@Controller()
export class PostsController {
  constructor(
    private readonly domain: DomainService,
    private readonly visibility: VisibilityService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get("posts")
  @RequirePermission("map:view")
  @ApiOperation({
    summary: "Postes posés sur la carte — ceux des opérations visibles par le compte",
    description: "Même portée que la liste des incidents : un wali voit les postes de sa région, un OPCOM ceux de son opération.",
  })
  list(@CurrentUser() user: AuthUser) {
    const scope = this.visibility.scopeOfUser(user.role, user.scope);
    const visibles = this.visibility.filterIncidents(this.domain.listIncidents(), scope, (id) => this.domain.entitiesOnIncident(id));
    return this.domain.listPosts(visibles.map((i) => i.id));
  }

  @Post("incidents/:id/posts")
  @RequirePermission("map_edit:create")
  @ApiOperation({ summary: "Poser un poste (PC, cellule, abri, parc) sur la carte d'une opération — Super Administrateur (audité)" })
  @ApiResponse({ status: 400, description: "Abri ou unité inconnus pour un poste qui en représente un." })
  @ApiResponse({ status: 404, description: "Incident inconnu." })
  create(@Param("id") id: string, @Body() dto: CreatePostDto, @CurrentUser() user: AuthUser, @AuditMeta() audit: AuditMetaSetter) {
    const post = this.domain.createPost({ incidentId: id, ...dto }, user.username);
    audit({ post: post.id, kind: post.kind, onto: id, entity: post.entityId });
    this.realtime.emit({ kind: "posts", incidentId: id });
    return post;
  }

  @Patch("incidents/:id/posts/:postId")
  @RequirePermission("map_edit:update")
  @ApiOperation({ summary: "Déplacer ou renommer un poste — Super Administrateur (audité)" })
  @ApiResponse({ status: 404, description: "Poste inconnu sur cette opération." })
  update(@Param("id") id: string, @Param("postId") postId: string, @Body() dto: UpdatePostDto, @AuditMeta() audit: AuditMetaSetter) {
    const post = this.domain.listPosts([id]).find((p) => p.id === postId);
    if (!post) throw new NotFoundException(`Poste inconnu : ${postId}`);
    const updated = this.domain.updatePost(postId, dto);
    audit({ post: postId, onto: id, moved: !!dto.ll, relabelled: dto.label !== undefined });
    this.realtime.emit({ kind: "posts", incidentId: id });
    return updated;
  }

  @Delete("incidents/:id/posts/:postId")
  @RequirePermission("map_edit:delete")
  @ApiOperation({ summary: "Retirer un poste de la carte — Super Administrateur (audité)" })
  @ApiResponse({ status: 404, description: "Poste inconnu sur cette opération." })
  remove(@Param("id") id: string, @Param("postId") postId: string, @CurrentUser() user: AuthUser, @AuditMeta() audit: AuditMetaSetter) {
    const post = this.domain.listPosts([id]).find((p) => p.id === postId);
    if (!post) throw new NotFoundException(`Poste inconnu : ${postId}`);
    this.domain.deletePost(postId, user.username);
    audit({ post: postId, removedFrom: id, kind: post.kind });
    this.realtime.emit({ kind: "posts", incidentId: id });
    return { deleted: postId };
  }
}
