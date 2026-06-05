import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCreatorPosts1741300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creator_posts" (
        "id"           uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "creatorType"  character varying NOT NULL,
        "creatorId"    character varying NOT NULL,
        "userId"       uuid          NOT NULL,
        "title"        character varying,
        "content"      text          NOT NULL,
        "imageUrls"    text          NOT NULL DEFAULT '[]',
        "likeCount"    integer       NOT NULL DEFAULT 0,
        "commentCount" integer       NOT NULL DEFAULT 0,
        "createdAt"    TIMESTAMP     NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP     NOT NULL DEFAULT now(),
        "deletedAt"    TIMESTAMP,
        CONSTRAINT "PK_creator_posts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_creator_posts_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_creator_posts_creatorType_creatorId"
        ON "creator_posts" ("creatorType", "creatorId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creator_post_likes" (
        "id"        uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "postId"    uuid      NOT NULL,
        "userId"    uuid      NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_creator_post_likes"  PRIMARY KEY ("id"),
        CONSTRAINT "UQ_creator_post_likes_post_user" UNIQUE ("postId", "userId"),
        CONSTRAINT "FK_creator_post_likes_post"
          FOREIGN KEY ("postId") REFERENCES "creator_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_creator_post_likes_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creator_post_comments" (
        "id"        uuid      NOT NULL DEFAULT uuid_generate_v4(),
        "postId"    uuid      NOT NULL,
        "userId"    uuid      NOT NULL,
        "content"   text      NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        CONSTRAINT "PK_creator_post_comments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_creator_post_comments_post"
          FOREIGN KEY ("postId") REFERENCES "creator_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_creator_post_comments_user"
          FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_creator_post_comments_postId"
        ON "creator_post_comments" ("postId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "creator_post_comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "creator_post_likes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "creator_posts"`);
  }
}
