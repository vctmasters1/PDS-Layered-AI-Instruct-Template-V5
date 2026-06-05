import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Add helpfulVoterIds column to reviews table for vote deduplication.
 * Stores JSON array of user IDs who voted "helpful" on a review.
 */
export class AddHelpfulVoterIdsToReviews1741000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "helpfulVoterIds" text DEFAULT '[]'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP COLUMN IF EXISTS "helpfulVoterIds"`
    );
  }
}
